import json
from typing import Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

rooms: Dict[str, Dict[str, WebSocket]] = {}


async def broadcast_to_room(room_id: str, sender_id: str, message: dict):
    if room_id not in rooms:
        return
    
    for user_id, websocket in rooms[room_id].items():
        if user_id != sender_id:
            try:
                await websocket.send_json(message)
            except Exception:
                pass


async def send_to_user(room_id: str, target_id: str, message: dict):
    if room_id in rooms and target_id in rooms[room_id]:
        try:
            await rooms[room_id][target_id].send_json(message)
        except Exception:
            pass


@router.websocket("/ws/{room_id}/{user_id}")
async def signaling_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    await websocket.accept()
    
    if room_id not in rooms:
        rooms[room_id] = {}
    
    rooms[room_id][user_id] = websocket
    
    existing_peers = [uid for uid in rooms[room_id].keys() if uid != user_id]
    
    await websocket.send_json({
        "type": "peers",
        "peers": existing_peers
    })
    
    await broadcast_to_room(room_id, user_id, {
        "type": "peer_joined",
        "peerId": user_id
    })
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            msg_type = message.get("type")
            target_id = message.get("targetId")
            
            if msg_type == "offer":
                await send_to_user(room_id, target_id, {
                    "type": "offer",
                    "offer": message.get("offer"),
                    "senderId": user_id
                })
            
            elif msg_type == "answer":
                await send_to_user(room_id, target_id, {
                    "type": "answer",
                    "answer": message.get("answer"),
                    "senderId": user_id
                })
            
            elif msg_type == "ice_candidate":
                await send_to_user(room_id, target_id, {
                    "type": "ice_candidate",
                    "candidate": message.get("candidate"),
                    "senderId": user_id
                })
    
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if room_id in rooms and user_id in rooms[room_id]:
            del rooms[room_id][user_id]
            
            await broadcast_to_room(room_id, user_id, {
                "type": "peer_left",
                "peerId": user_id
            })
            
            if not rooms[room_id]:
                del rooms[room_id]
