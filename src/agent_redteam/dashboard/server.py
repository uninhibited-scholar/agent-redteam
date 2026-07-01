"""WebSocket server for real-time telemetry during live scans.

Uses Python stdlib only — custom minimal WS frame parser (no websockets lib).
Supports the basic text frame protocol (RFC 6455) for sending JSON events.
"""
from __future__ import annotations
import base64, hashlib, json, os, struct, threading
from socketserver import ThreadingMixIn
from http.server import HTTPServer, BaseHTTPRequestHandler


class WebSocketClient:
    """A minimal WebSocket connection wrapper."""
    def __init__(self, request_handler):
        self.handler = request_handler
        self.wfile = request_handler.wfile
        self.alive = True

    def send_text(self, message: str) -> bool:
        """Send a text frame. Returns False if client disconnected."""
        if not self.alive:
            return False
        try:
            data = message.encode("utf-8")
            header = bytearray()
            header.append(0x81)  # FIN + text opcode
            mask_bit = 0
            if len(data) < 126:
                header.append(mask_bit | len(data))
            elif len(data) < 65536:
                header.append(mask_bit | 126)
                header.extend(struct.pack(">H", len(data)))
            else:
                header.append(mask_bit | 127)
                header.extend(struct.pack(">Q", len(data)))
            self.wfile.write(bytes(header) + data)
            self.wfile.flush()
            return True
        except (BrokenPipeError, ConnectionResetError, OSError):
            self.alive = False
            return False


class TelemetryBroadcaster:
    """Manages WebSocket clients and broadcasts telemetry events."""
    def __init__(self):
        self.clients: list[WebSocketClient] = []
        self.lock = threading.Lock()

    def add_client(self, client: WebSocketClient):
        with self.lock:
            self.clients.append(client)

    def remove_client(self, client: WebSocketClient):
        with self.lock:
            if client in self.clients:
                self.clients.remove(client)

    def broadcast(self, event: dict):
        """Broadcast an event to all connected clients."""
        msg = json.dumps(event, ensure_ascii=False)
        with self.lock:
            dead = []
            for client in self.clients:
                if not client.send_text(msg):
                    dead.append(client)
            for d in dead:
                self.clients.remove(d)

    @property
    def client_count(self) -> int:
        return len(self.clients)


# Global broadcaster instance
broadcaster = TelemetryBroadcaster()


def perform_ws_handshake(handler) -> bool:
    """Perform the WebSocket upgrade handshake on a BaseHTTPRequestHandler."""
    key = handler.headers.get("Sec-WebSocket-Key", "")
    if not key:
        return False

    # RFC 6455 magic string
    magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
    accept = base64.b64encode(
        hashlib.sha1((key + magic).encode()).digest()
    ).decode()

    handler.send_response(101)
    handler.send_header("Upgrade", "websocket")
    handler.send_header("Connection", "Upgrade")
    handler.send_header("Sec-WebSocket-Accept", accept)
    handler.end_headers()
    return True


def handle_ws_connection(handler):
    """Handle a WebSocket connection — read loop (we mostly just write)."""
    client = WebSocketClient(handler)
    broadcaster.add_client(client)

    try:
        # Read loop — keep connection alive, discard incoming frames
        while client.alive:
            try:
                header = handler.rfile.read(2)
                if len(header) < 2:
                    break
                # Parse frame (we don't care about content, just keep alive)
                opcode = header[0] & 0x0F
                masked = (header[1] & 0x80) != 0
                length = header[1] & 0x7F

                if length == 126:
                    handler.rfile.read(2)
                elif length == 127:
                    handler.rfile.read(8)

                if masked:
                    handler.rfile.read(4)  # mask key

                if length > 0 and length < 65536:
                    handler.rfile.read(length)

                if opcode == 0x8:  # close
                    break
            except (BrokenPipeError, ConnectionResetError, OSError):
                break
    finally:
        broadcaster.remove_client(client)
        client.alive = False
