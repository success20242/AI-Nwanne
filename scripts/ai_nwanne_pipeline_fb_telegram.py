#!/usr/bin/env python3
# ai_nwanne_pipeline_fb_telegram.py
# African wisdom daily bot: fetch, generate commentary, handle images, post to FB + Telegram

import os
import json
import random
import hashlib
import requests
import re
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Optional OpenAI enrichment
from openai import OpenAI

load_dotenv()

# ------------------- CONFIG -------------------

USE_OPENAI = os.getenv("USE_OPENAI", "False").lower() == "true"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if USE_OPENAI:
    client = OpenAI(api_key=OPENAI_API_KEY)

USED_TOPICS_FILE = "used_topics.json"
MAX_TOPIC_MEMORY = 500
FIXED_HASHTAGS = ["#AINwanne", "#NaijaCulture", "#AfricanAI"]

# Facebook
FB_PAGE_ID = os.getenv("FACEBOOK_PAGE_ID")
FB_ACCESS_TOKEN = os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN")

# Telegram
TG_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TG_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

MAX_POSTS_PER_RUN = 2

# ------------------- HELPERS -------------------

def get_used_topics():
    if not os.path.exists(USED_TOPICS_FILE):
        return []
    try:
        with open(USED_TOPICS_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []

def save_used_topic(topic):
    topics = get_used_topics()
    topics.append(topic)
    topics = topics[-MAX_TOPIC_MEMORY:]
    with open(USED_TOPICS_FILE, "w") as f:
        json.dump(topics, f, indent=2)

def hash_text(text):
    return hashlib.md5(text.encode()).hexdigest()

def clean_text(raw_html):
    return re.sub('<.*?>', '', raw_html).strip()

def load_wisdom_list():
    """Load proverbs from local JSON file"""
    if not os.path.exists("wisdom.json"):
        return []
    with open("wisdom.json", "r", encoding="utf-8") as f:
        return json.load(f)

def pick_wisdom():
    """Select random unused proverbs"""
    used = get_used_topics()
    all_wisdom = load_wisdom_list()
    unused = [w for w in all_wisdom if w not in used]
    if not unused:
        unused = all_wisdom  # allow reuse if exhausted
    return random.choice(unused)

def automatic_commentary(wisdom):
    """Generate short automatic commentary with emojis"""
    emojis = ["🌍", "🗣️", "💡", "🤝", "🌿", "📖"]
    return [
        f"Reflect on this {random.choice(emojis)}: {wisdom}",
        f"This teaches us {random.choice(emojis)}: {wisdom}",
        f"Share and spread African wisdom {random.choice(emojis)}!"
    ]

def ai_commentary(wisdom):
    """Optional: use OpenAI to generate a 1-2 sentence commentary"""
    if not USE_OPENAI:
        return automatic_commentary(wisdom)
    
    prompt = f"Provide a short (1-2 sentences) insightful commentary on this African proverb: '{wisdom}'. Include a relevant emoji."
    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.9
        )
        text = response.choices[0].message.content.strip()
        # Split into 3 lines for social media formatting
        lines = [f"💭 {text}"] + automatic_commentary(wisdom)[1:]
        return lines
    except Exception as e:
        print(f"[WARN] OpenAI commentary failed: {e}")
        return automatic_commentary(wisdom)

# ------------------- POSTING -------------------

def post_to_facebook(content):
    url = f"https://graph.facebook.com/{FB_PAGE_ID}/feed"
    resp = requests.post(url, data={"message": content, "access_token": FB_ACCESS_TOKEN})
    if resp.ok:
        print(f"✅ Posted to Facebook: {resp.json().get('id')}")
    else:
        print(f"❌ Facebook error: {resp.text}")

def post_to_telegram(content):
    url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"
    # Escape Telegram MarkdownV2 special characters
    for ch in r"_*[]()~`>#+-=|{}.!":
        content = content.replace(ch, f"\\{ch}")
    payload = {"chat_id": TG_CHAT_ID, "text": content, "parse_mode": "MarkdownV2"}
    resp = requests.post(url, json=payload)
    if resp.ok:
        print(f"✅ Posted to Telegram: {resp.json()['result']['message_id']}")
    else:
        print(f"❌ Telegram error: {resp.text}")

# ------------------- MAIN PIPELINE -------------------

def run_pipeline():
    posts_done = 0
    posted_hashes = set()
    
    while posts_done < MAX_POSTS_PER_RUN:
        wisdom = pick_wisdom()
        save_used_topic(wisdom)

        commentary_lines = ai_commentary(wisdom)
        content_lines = [f"📝 Proverb: {wisdom}"] + commentary_lines + ["", " ".join(FIXED_HASHTAGS)]
        post_text = "\n".join(content_lines)

        # Avoid duplicate in same run
        content_hash = hash_text(post_text)
        if content_hash in posted_hashes:
            continue
        posted_hashes.add(content_hash)

        post_to_facebook(post_text)
        post_to_telegram(post_text)
        posts_done += 1

if __name__ == "__main__":
    run_pipeline()
