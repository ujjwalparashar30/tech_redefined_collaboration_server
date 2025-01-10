import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import crypto from 'crypto';
import cors from 'cors';
import winston from 'winston';
import mongoose from 'mongoose';
import { User } from './userSchema';

const MongoDb_Url_Local = "mongodb+srv://abhinavsmile7:Yiv2jFJkDp15ZkLl@cluster0.hore4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"

interface ShapeData {
    rectangles: any[];
    circles: any[];
    arrows: any[];
    scribbles: any[];
    text: any[];
}

interface Room {
    name: string;
    clients: Set<WebSocket>;
    shapes: ShapeData;
}

interface User {
    id: string;
    data: any; // Represents additional data fetched from the database
}

interface Message {
    type: string;
    [key: string]: any;
}

// Initialize logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'server.log' })
    ]
});

const app = express();
app.use(cors({
    origin: 'http://your-frontend-url.com',
    methods: ['GET', 'POST']
}));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms: Map<string, Room> = new Map();
const users: Map<WebSocket, User> = new Map();

// Simulate database call to fetch user data
async function fetchUserData(userId: string): Promise<any> {
    mongoose
  .connect(MongoDb_Url_Local as string)
  .then(() => {
    console.log("Connected to the database");
  })
  .catch((err:Error) => {
    console.log(err);
  });
  const user = await User.findById(userId)
    return user ;
}

function broadcastToRoom(roomId: string, message: any, excludeClient?: WebSocket): void {
    const room = rooms.get(roomId);
    if (!room) return;

    room.clients.forEach(client => {
        if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

function broadcastRoomsList(): void {
    const roomsList = getRoomsList();
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'rooms-list',
                rooms: roomsList,
            }));
        }
    });
}

function getRoomsList(): { id: string; name: string; participants: number }[] {
    return Array.from(rooms.entries()).map(([id, room]) => ({
        id,
        name: room.name,
        participants: room.clients.size
    }));
}

// REST API for fetching room data
app.get('/rooms', (_req, res) => {
    res.json(getRoomsList());
});

// WebSocket heartbeat (keep-alive)
function heartbeat(this: WebSocket): void {
    (this as any).isAlive = true;
}

setInterval(() => {
    wss.clients.forEach((ws: WebSocket & { isAlive?: boolean }) => {
        if (!ws.isAlive) {
            logger.info(`Terminating inactive connection: ${users.get(ws)?.id}`);
            return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('connection', async (ws: WebSocket & { isAlive?: boolean; roomId?: string }) => {
    ws.isAlive = true;
    ws.on('pong', heartbeat);

    ws.on('message', async (data: string) => {
        let message: Message;
        try {
            message = JSON.parse(data);
        } catch (err) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
            logger.error('Invalid message format');
            return;
        }

        if (message.type === 'init-user') {
            const userId = message.userId;
            try {
                const userData = await fetchUserData(userId);
                users.set(ws, { id: userId, data: userData });
                logger.info(`User connected: ${userId}`);

                ws.send(JSON.stringify({
                    type: 'user-initialized',
                    userData
                }));
            } catch (err) {
                ws.send(JSON.stringify({ type: 'error', message: 'Failed to fetch user data' }));
                logger.error(`Failed to fetch user data for userId: ${userId}`);
            }
            return;
        }

        const user = users.get(ws);
        if (!user) {
            ws.send(JSON.stringify({ type: 'error', message: 'User not initialized' }));
            logger.error('User not initialized');
            return;
        }

        switch (message.type) {
            case 'get-rooms':
                ws.send(JSON.stringify({
                    type: 'rooms-list',
                    rooms: getRoomsList()
                }));
                break;

            case 'create-room':
                const roomId = crypto.randomBytes(4).toString('hex');
                rooms.set(roomId, {
                    name: message.name,
                    clients: new Set([ws]),
                    shapes: {
                        rectangles: [],
                        circles: [],
                        arrows: [],
                        scribbles: [],
                        text: []
                    }
                });
                ws.roomId = roomId;
                ws.send(JSON.stringify({
                    type: 'room-created',
                    roomId,
                }));
                logger.info(`Room created: ${roomId} by user ${user.id}`);

                broadcastRoomsList();
                break;

            case 'join-room':
                const room = rooms.get(message.roomId);
                if (room) {
                    room.clients.add(ws);
                    ws.roomId = message.roomId;
                    ws.send(JSON.stringify({
                        type: 'room-joined',
                        roomId: message.roomId,
                        shapes: room.shapes
                    }));
                    broadcastToRoom(message.roomId, {
                        type: 'participants-update',
                        participants: Array.from(room.clients).map(client => ({
                            id: users.get(client)?.id
                        }))
                    });
                } else {
                    ws.send(JSON.stringify({
                        type: 'join-failed',
                        message: `Room ${message.roomId} not found`
                    }));
                    logger.warn(`Join-room failed: Room ${message.roomId} not found for user ${user.id}`);
                }
                break;

            case 'shape-update':
                const targetRoom = rooms.get(message.roomId);
                if (targetRoom) {
                    targetRoom.shapes = message.shapes;
                    broadcastToRoom(message.roomId, message, ws);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found for shape update' }));
                    logger.warn(`Shape update failed: Room ${message.roomId} not found for user ${user.id}`);
                }
                break;

            default:
                ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
                logger.error(`Unknown message type: ${message.type}`);
        }
    });

    ws.on('close', () => {
        const user = users.get(ws);
        if (ws.roomId) {
            const room = rooms.get(ws.roomId);
            if (room) {
                room.clients.delete(ws);
                if (room.clients.size === 0) {
                    rooms.delete(ws.roomId);
                    logger.info(`Room deleted: ${ws.roomId}`);
                    broadcastRoomsList();
                } else {
                    broadcastToRoom(ws.roomId, {
                        type: 'participants-update',
                        participants: Array.from(room.clients).map(client => ({
                            id: users.get(client)?.id
                        }))
                    });
                }
            }
        }
        users.delete(ws);
        logger.info(`User disconnected: ${user?.id || 'unknown'}`);
    });
});

server.listen(3001, () => {
    logger.info('Server running on port 3001');
    console.log('Server running on port 3001');
});
