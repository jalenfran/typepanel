# syntax=docker/dockerfile:1.7
FROM rust:1.90-alpine AS builder

RUN apk add --no-cache musl-dev

WORKDIR /build

# Cache dependencies separately from source.
COPY server/Cargo.toml server/Cargo.lock* ./
RUN mkdir src && echo "fn main() {}" > src/main.rs \
    && cargo build --release --target x86_64-unknown-linux-musl \
    && rm -rf src target/x86_64-unknown-linux-musl/release/deps/typepanel_server*

COPY server/src ./src
RUN cargo build --release --target x86_64-unknown-linux-musl \
    && cp target/x86_64-unknown-linux-musl/release/typepanel-server /typepanel-server

FROM scratch

COPY --from=builder /typepanel-server /typepanel-server

ENV RUST_LOG=info
ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["/typepanel-server"]
