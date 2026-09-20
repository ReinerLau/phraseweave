interface Environment {
  ROOM: DurableObjectNamespace;
}

type Role = "sender" | "receiver";

interface ClientMessage {
  type: "join" | "signal";
  role?: Role;
  data?: unknown;
}

const ROOM_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export default {
  async fetch(request: Request, environment: Environment): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/room\/([a-f0-9]{64})$/);

    if (!match || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Not found", { status: 404 });
    }

    const roomToken = match[1];
    if (!ROOM_TOKEN_PATTERN.test(roomToken)) {
      return new Response("Invalid room", { status: 400 });
    }

    const id = environment.ROOM.idFromName(roomToken);
    return environment.ROOM.get(id).fetch(request);
  },
};

export class Room {
  private readonly clients = new Map<WebSocket, Role>();

  constructor(private readonly state: DurableObjectState) {}

  fetch(request: Request) {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    server.addEventListener("message", (event) => this.handleMessage(server, event.data));
    server.addEventListener("close", () => this.remove(server));
    server.addEventListener("error", () => this.remove(server));

    return new Response(null, { status: 101, webSocket: client });
  }

  private handleMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string") return;

    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      this.sendError(socket, "Invalid message");
      return;
    }

    if (message.type === "join") {
      if (message.role !== "sender" && message.role !== "receiver") {
        this.sendError(socket, "Invalid role");
        return;
      }

      const existing = [...this.clients.entries()].find(([, role]) => role === message.role);
      if (existing) {
        this.sendError(socket, "This transfer role is already occupied");
        socket.close(1008, "Role occupied");
        return;
      }

      this.clients.set(socket, message.role);
      if (this.clients.size === 2) {
        this.broadcast({ type: "peer-ready" });
      }
      return;
    }

    if (message.type === "signal" && this.clients.has(socket)) {
      for (const other of this.clients.keys()) {
        if (other !== socket && other.readyState === WebSocket.OPEN) {
          other.send(JSON.stringify({ type: "signal", data: message.data }));
        }
      }
    }
  }

  private remove(socket: WebSocket) {
    this.clients.delete(socket);
    if (this.clients.size === 0) {
      void this.state.storage.deleteAll();
    }
  }

  private broadcast(message: unknown) {
    const serialized = JSON.stringify(message);
    for (const socket of this.clients.keys()) {
      if (socket.readyState === WebSocket.OPEN) socket.send(serialized);
    }
  }

  private sendError(socket: WebSocket, message: string) {
    if (socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ type: "error", message }));
  }
}
