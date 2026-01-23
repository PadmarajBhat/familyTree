import asyncio

class UserMixin:
    async def get_user_preferences(self, email):
        if not email: return {}
        doc = await asyncio.to_thread(self.users_ref.document(email).get)
        return doc.to_dict() if doc.exists else {}

    async def save_user_preferences(self, email, prefs):
        if not email: return False
        doc_ref = self.users_ref.document(email)
        await asyncio.to_thread(doc_ref.set, prefs, merge=True)
        return True
