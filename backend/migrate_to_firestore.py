import json
import os
from google.cloud import firestore

def migrate():
    # 1. Initialize Firestore
    db = firestore.Client(project='familytree-477808')
    
    # 2. Path to sample data
    json_path = 'public/family_tree_Sample_2026-01-08.json'
    if not os.path.exists(json_path):
        print(f"Error: {json_path} not found.")
        return

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 3. Create/Update Tree Metadata
    tree_ref = db.collection('trees').document('default')
    tree_ref.set({
        'treeName': data.get('treeName', 'Family Tree'),
        'rootNodeId': data.get('rootNodeId'),
        'updatedAt': firestore.SERVER_TIMESTAMP
    })
    print(f"Migrated tree metadata: {data.get('treeName', 'Family Tree')}")

    # 4. Migrate Nodes
    nodes = data.get('nodes', {})
    batch = db.batch()
    count = 0
    total = len(nodes)

    for node_id, node_data in nodes.items():
        doc_ref = db.collection('people').document(node_id)
        # Ensure all necessary fields are present
        doc_data = {
            'nodeId': node_id,
            'name': node_data.get('name', 'Unknown'),
            'gender': node_data.get('gender', 'Unknown'),
            'dob': node_data.get('dob'),
            'parentId': node_data.get('parentId'),
            'spouseIds': node_data.get('spouseIds', []),
            'childrenIds': node_data.get('childrenIds', []),
            'imageUrl': node_data.get('imageUrl'),
            'metadata': node_data.get('metadata', {}),
            'lastUpdated': firestore.SERVER_TIMESTAMP
        }
        batch.set(doc_ref, doc_data)
        count += 1
        
        # Firestore batch supports up to 500 operations
        if count % 500 == 0:
            batch.commit()
            batch = db.batch()
            print(f"Committed {count}/{total} nodes...")

    batch.commit()
    print(f"Successfully migrated {count} nodes to Firestore.")

if __name__ == "__main__":
    migrate()
