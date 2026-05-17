use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use anyhow::Result;
use axum::extract::ws::{Message as WsMessage, WebSocket};
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{mpsc, Mutex};
use tokio::task::JoinHandle;
use tokio::time::Instant;

use yrs::encoding::read::Cursor;
use yrs::sync::{Message as YMessage, MessageReader, SyncMessage};
use yrs::updates::decoder::{Decode, DecoderV1};
use yrs::updates::encoder::{Encode, Encoder, EncoderV1};
use yrs::{Doc, ReadTxn, Transact, Update};

use crate::limits::{
    EMPTY_ROOM_TTL, MAX_CLIENTS_PER_ROOM, MAX_FRAME_BYTES, MAX_ROOMS, RATE_LIMIT_BURST,
    RATE_LIMIT_MSG_PER_SEC, SEND_QUEUE_DEPTH,
};

type ClientId = u64;
type Sender = mpsc::Sender<Vec<u8>>;

// Server-side doc tracks CRDT state so new clients can sync from us, not peers.
// Awareness (presence) is forwarded transparently — we don't track it.
pub struct Room {
    doc: Doc,
    clients: Mutex<HashMap<ClientId, Sender>>,
    reap: Mutex<Option<JoinHandle<()>>>,
}

impl Room {
    fn new() -> Self {
        Self {
            doc: Doc::new(),
            clients: Mutex::new(HashMap::new()),
            reap: Mutex::new(None),
        }
    }
}

pub struct AppState {
    rooms: DashMap<String, Arc<Room>>,
    next_client_id: AtomicU64,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            rooms: DashMap::new(),
            next_client_id: AtomicU64::new(1),
        }
    }
}

pub async fn handle_socket(
    socket: WebSocket,
    room_id: String,
    state: Arc<AppState>,
    peer: SocketAddr,
) {
    let room = match acquire_room(&state, &room_id) {
        Some(r) => r,
        None => {
            tracing::warn!(%peer, room=%room_id, "room cap reached");
            return;
        }
    };

    {
        let mut reap = room.reap.lock().await;
        if let Some(handle) = reap.take() {
            handle.abort();
        }
    }

    let client_id = state.next_client_id.fetch_add(1, Ordering::Relaxed);
    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(SEND_QUEUE_DEPTH);

    {
        let mut clients = room.clients.lock().await;
        if clients.len() >= MAX_CLIENTS_PER_ROOM {
            tracing::warn!(%peer, room=%room_id, "client cap reached");
            return;
        }
        clients.insert(client_id, tx);
    }

    tracing::info!(%peer, room=%room_id, client=%client_id, "connected");

    let (mut sink, mut stream) = socket.split();

    let writer: JoinHandle<()> = tokio::spawn(async move {
        while let Some(payload) = rx.recv().await {
            if sink.send(WsMessage::Binary(payload.into())).await.is_err() {
                break;
            }
        }
        let _ = sink.close().await;
    });

    if let Some(payload) = build_initial_sync(&room) {
        let clients = room.clients.lock().await;
        if let Some(s) = clients.get(&client_id) {
            let _ = s.try_send(payload);
        }
    }

    let mut tokens: f64 = RATE_LIMIT_BURST;
    let mut last_refill = Instant::now();
    let mut bad_frames: u32 = 0;

    while let Some(msg) = stream.next().await {
        let frame = match msg {
            Ok(WsMessage::Binary(b)) => b,
            Ok(WsMessage::Close(_)) => break,
            Ok(WsMessage::Text(_)) => break,
            Ok(_) => continue,
            Err(_) => break,
        };

        if frame.len() > MAX_FRAME_BYTES {
            break;
        }

        let now = Instant::now();
        let elapsed = now.duration_since(last_refill).as_secs_f64();
        tokens = (tokens + elapsed * RATE_LIMIT_MSG_PER_SEC).min(RATE_LIMIT_BURST);
        last_refill = now;
        if tokens < 1.0 {
            continue;
        }
        tokens -= 1.0;

        if process_frame(&frame, &room, client_id).await.is_err() {
            bad_frames += 1;
            if bad_frames > 16 {
                break;
            }
        }
    }

    let remaining = {
        let mut clients = room.clients.lock().await;
        clients.remove(&client_id);
        clients.len()
    };
    tracing::info!(%peer, room=%room_id, client=%client_id, remaining, "disconnected");

    if remaining == 0 {
        schedule_reap(state.clone(), room_id.clone(), Arc::clone(&room)).await;
    }

    writer.abort();
}

fn acquire_room(state: &AppState, room_id: &str) -> Option<Arc<Room>> {
    if let Some(r) = state.rooms.get(room_id) {
        return Some(r.clone());
    }
    if state.rooms.len() >= MAX_ROOMS {
        return None;
    }
    Some(
        state
            .rooms
            .entry(room_id.to_string())
            .or_insert_with(|| Arc::new(Room::new()))
            .clone(),
    )
}

fn build_initial_sync(room: &Room) -> Option<Vec<u8>> {
    let sv = room.doc.transact().state_vector();
    let mut encoder = EncoderV1::new();
    YMessage::Sync(SyncMessage::SyncStep1(sv)).encode(&mut encoder);
    Some(encoder.to_vec())
}

async fn schedule_reap(state: Arc<AppState>, room_id: String, room: Arc<Room>) {
    let state_for_task = state.clone();
    let room_id_for_task = room_id.clone();
    let room_for_task = Arc::clone(&room);
    let handle = tokio::spawn(async move {
        tokio::time::sleep(EMPTY_ROOM_TTL).await;
        let clients = room_for_task.clients.lock().await;
        if clients.is_empty() {
            state_for_task.rooms.remove(&room_id_for_task);
            tracing::info!(room=%room_id_for_task, "reaped empty room");
        }
    });
    let mut reap = room.reap.lock().await;
    *reap = Some(handle);
}

async fn process_frame(frame: &[u8], room: &Arc<Room>, sender: ClientId) -> Result<()> {
    let mut decoder = DecoderV1::new(Cursor::new(frame));
    let reader = MessageReader::new(&mut decoder);

    let mut reply_encoder: Option<EncoderV1> = None;
    let mut broadcast_encoder: Option<EncoderV1> = None;

    for msg_res in reader {
        let msg = msg_res.map_err(|e| anyhow::anyhow!(format!("{e:?}")))?;

        match msg {
            YMessage::Sync(SyncMessage::SyncStep1(sv)) => {
                let diff = room.doc.transact().encode_state_as_update_v1(&sv);
                let enc = reply_encoder.get_or_insert_with(EncoderV1::new);
                YMessage::Sync(SyncMessage::SyncStep2(diff)).encode(enc);
            }
            YMessage::Sync(SyncMessage::SyncStep2(bytes))
            | YMessage::Sync(SyncMessage::Update(bytes)) => {
                let update = Update::decode_v1(&bytes)
                    .map_err(|e| anyhow::anyhow!("bad update: {e:?}"))?;
                {
                    let mut txn = room.doc.transact_mut();
                    txn.apply_update(update)
                        .map_err(|e| anyhow::anyhow!("apply: {e:?}"))?;
                }
                let enc = broadcast_encoder.get_or_insert_with(EncoderV1::new);
                YMessage::Sync(SyncMessage::Update(bytes)).encode(enc);
            }
            YMessage::Awareness(update) => {
                // Forward presence without server-side tracking.
                let enc = broadcast_encoder.get_or_insert_with(EncoderV1::new);
                YMessage::Awareness(update).encode(enc);
            }
            YMessage::AwarenessQuery => {
                // No server-side awareness; nothing to send.
            }
            _ => {}
        }
    }

    if let Some(enc) = reply_encoder {
        let payload = enc.to_vec();
        let clients = room.clients.lock().await;
        if let Some(tx) = clients.get(&sender) {
            let _ = tx.try_send(payload);
        }
    }

    if let Some(enc) = broadcast_encoder {
        let payload = enc.to_vec();
        let clients = room.clients.lock().await;
        for (cid, tx) in clients.iter() {
            if *cid == sender {
                continue;
            }
            let _ = tx.try_send(payload.clone());
        }
    }

    Ok(())
}
