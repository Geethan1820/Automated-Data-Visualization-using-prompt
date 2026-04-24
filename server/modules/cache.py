import logging
logger = logging.getLogger(__name__)

class SimpleCache:
    """Permanent in-memory dictionary cache."""
    def __init__(self):
        self._storage = {}
        logger.info("✅ SUCCESS: In-Memory Cache Active. No external dependencies required.")
    def set(self, key, value, expire=3600):
        self._storage[key] = value
        return True
    def get(self, key):
        return self._storage.get(key)
    def delete(self, key):
        self._storage.pop(key, None)
        return True

# Export the singleton instance
cache_client = SimpleCache()

# Helper wrappers used by main.py
def get_df_cache(file_id):
    return cache_client.get(f"df_{file_id}")

def set_df_cache(file_id, df):
    return cache_client.set(f"df_{file_id}", df)

def clear_df_cache(file_id):
    return cache_client.delete(f"df_{file_id}")

def set_session_memory(file_id, context):
    return cache_client.set(f"ctx_{file_id}", context)

def get_session_memory(file_id):
    return cache_client.get(f"ctx_{file_id}")

def get_json_cache(key):
    return cache_client.get(f"json_{key}")

def set_json_cache(key, value):
    return cache_client.set(f"json_{key}", value)
