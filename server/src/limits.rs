use std::time::Duration;

pub const MAX_FRAME_BYTES: usize = 1024 * 1024;
pub const MAX_ROOMS: usize = 10_000;
pub const MAX_CLIENTS_PER_ROOM: usize = 50;
pub const RATE_LIMIT_MSG_PER_SEC: f64 = 200.0;
pub const RATE_LIMIT_BURST: f64 = 400.0;
pub const EMPTY_ROOM_TTL: Duration = Duration::from_secs(180);
pub const SEND_QUEUE_DEPTH: usize = 64;
pub const MAX_ROOM_ID_LEN: usize = 128;

pub fn is_valid_room_id(s: &str) -> bool {
    let len = s.len();
    if !(1..=MAX_ROOM_ID_LEN).contains(&len) {
        return false;
    }
    s.bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}
