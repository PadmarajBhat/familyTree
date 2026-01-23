import asyncio
from google.cloud import firestore

async def wipe_db():
    print("🔥 Connecting to Firestore...")
    db = firestore.Client(project='familytree-477808')
    
    collections = ['people', 'trees', 'chats', 'audit_logs', 'users']
    
    for col_name in collections:
        print(f"🗑️ Deleting collection: {col_name}...")
        ref = db.collection(col_name)
        count = 0
        
        while True:
            # Delete in batches
            docs = list(ref.limit(400).stream())
            if not docs:
                break
                
            batch = db.batch()
            for doc in docs:
                batch.delete(doc.reference)
            
            batch.commit()
            count += len(docs)
            print(f"   Deleted batch of {len(docs)} docs...")
            
        print(f"   ✅ Deleted total {count} docs from {col_name}.")

    print("✨ Database Wiped Successfully!")

if __name__ == "__main__":
    asyncio.run(wipe_db())
