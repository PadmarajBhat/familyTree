import asyncio
import uuid
from google.cloud import firestore
import datetime

async def seed_govinda():
    print("🔥 Connecting to Firestore...")
    db = firestore.Client(project='familytree-477808')
    
    # 1. Generate IDs
    tree_id = str(uuid.uuid4())
    root_id = str(uuid.uuid4())
    owner_email = "padmarajbhat@gmail.com" # Default to user's email
    
    print(f"🌱 Creating Tree: Govinda's Family ({tree_id})...")
    
    # 2. Create Tree Metadata
    tree_data = {
        "treeId": tree_id,
        "treeName": "Govinda's Family",
        "owner": owner_email,
        "rootNodeId": root_id,
        "createdTime": firestore.SERVER_TIMESTAMP,
        "editors": [owner_email]
    }
    db.collection('trees').document(tree_id).set(tree_data)
    
    # 3. Create Root Person (Govinda)
    print(f"👤 Creating Root Node: Govinda ({root_id})...")
    person_data = {
        "nodeId": root_id,
        "treeId": tree_id,
        "name": "Govinda",
        "gender": "male",
        "birthDate": None, # or string "YYYY-MM-DD"
        "isRoot": True,
        "parentId": None,
        "spouseIds": [],
        "childrenIds": [],
        "notes": "Root Ancestor"
    }
    db.collection('people').document(root_id).set(person_data)
    
    print("✅ Seed Complete!")
    print(f"Tree ID: {tree_id}")
    print("Please restart 'python main.py' and reload the web app.")

if __name__ == "__main__":
    asyncio.run(seed_govinda())
