#!/usr/bin/env python3
# ai_nwanne_pipeline_fb_telegram.py
# African wisdom daily bot: fetch, generate commentary, handle images, post to FB + Telegram

import os
import json
import hashlib
import requests
import random
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# ------------------- CONFIG -------------------

USED_TOPICS_FILE = "used_topics.json"
MAX_TOPIC_MEMORY = 500
FIXED_HASHTAGS = ["#AINwanne", "#NaijaCulture", "#AfricanAI"]

# Facebook
FB_PAGE_ID = os.getenv("FACEBOOK_PAGE_ID")
FB_ACCESS_TOKEN = os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN")

# Telegram
TG_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TG_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

# Optional image support
USE_IMAGE = os.getenv("USE_IMAGE", "False").lower() == "true"
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")

# African Proverbs API
PROVERB_API_URL = "https://africanproverbs.onrender.com/api/proverb"

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

def capitalize_sentences(text):
    # Capitalizes first letter of each sentence
    sentences = [s.strip().capitalize() for s in text.split('.') if s.strip()]
    return '. '.join(sentences) + ('.' if sentences else '')

def fetch_random_proverb():
    try:
        resp = requests.get(PROVERB_API_URL)
        resp.raise_for_status()
        data = resp.json()
        # Check required keys
        proverb_obj = {
            'proverb': data.get('proverb', ''),
            'interpretation': data.get('interpretation', ''),
            'native': data.get('native', ''),
            'translation': ''
        }
        # Include first translation if exists
        translations = data.get('translations', [])
        if translations:
            proverb_obj['translation'] = translations[0].get('proverb', '')
        return proverb_obj
    except Exception as e:
        print(f"[ERROR] Failed to fetch proverb: {e}")
        return None

# ------------------- POST FORMATTING -------------------

def generate_commentary(proverb_obj):
    """
    Generate professional-looking post content with emojis, proper capitalization,
    and a fun fact section for country/language.
    """
    header_emoji = random.choice(["🌞", "🌟", "🔥", "✨", "🌿", "📜", "🦁", "🌍"])
    line_emojis = random.sample(["💡", "📝", "🗣️", "🔤", "🌐"], 2)

    # Capitalize the proverb and interpretation
    proverb_text = capitalize_sentences(proverb_obj['proverb'])
    interpretation_text = capitalize_sentences(proverb_obj.get('interpretation', ''))
    translation_text = capitalize_sentences(proverb_obj.get('translation', ''))
    native_text = proverb_obj.get('native', '')

    lines = []
    lines.append(f"{header_emoji} *Proverb of the Day* {header_emoji}\n")
    lines.append(f"🌍 *Proverb:* {proverb_text}")

    if interpretation_text:
        lines.append(f"{line_emojis[0]} *Interpretation:* {interpretation_text}")

    if native_text:
        lines.append(f"{line_emojis[1]} *Native Language / Country:* {native_text}")

    if translation_text:
        lines.append(f"🔤 *Translation:* {translation_text}")

    # Fun fact section
    if native_text:
        lines.append(f"💡 *Fun Fact:* This proverb comes from {native_text} and reflects local wisdom.")

    lines.append("\n✨ Share and spread African wisdom!")
    lines.append(" ".join(FIXED_HASHTAGS))

    return "\n".join(lines)

# ------------------- CLOUDINARY IMAGE -------------------

def upload_image_to_cloudinary(image_url):
    if not (CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET):
        return None
    upload_url = f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD_NAME}/image/upload"
    try:
        resp = requests.post(
            upload_url,
            data={"file": image_url, "upload_preset": "ml_default"},
            auth=(CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)
        )
        resp.raise_for_status()
        return resp.json().get("secure_url")
    except Exception as e:
        print(f"[ERROR] Cloudinary upload failed: {e}")
        return None

# ------------------- FACEBOOK -------------------

def post_to_facebook(content):
    url = f"https://graph.facebook.com/{FB_PAGE_ID}/feed"
    resp = requests.post(url, data={"message": content, "access_token": FB_ACCESS_TOKEN})
    if resp.ok:
        print(f"✅ Posted to Facebook: {resp.json().get('id')}")
        return resp.json()
    else:
        print(f"❌ Facebook error: {resp.text}")
        return None

# ------------------- TELEGRAM -------------------

def post_to_telegram(content):
    url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TG_CHAT_ID,
        "text": content,
        "parse_mode": "MarkdownV2",
        "disable_web_page_preview": True
    }
    # Escape Telegram MarkdownV2 special characters
    for ch in r"_*[]()~`>#+-=|{}.!":
        payload['text'] = payload['text'].replace(ch, f"\\{ch}")

    resp = requests.post(url, json=payload)
    if resp.ok:
        print(f"✅ Posted to Telegram: {resp.json()['result']['message_id']}")
        return resp.json()
    else:
        print(f"❌ Telegram error: {resp.text}")
        return None

# ------------------- MAIN PIPELINE -------------------

def run_pipeline():
    proverb_obj = fetch_random_proverb()
    if not proverb_obj:
        print("[WARN] No proverb fetched today.")
        return

    # Avoid duplicate posts using hash
    proverb_hash = hash_text(proverb_obj['proverb'])
    used_hashes = [hash_text(t) for t in get_used_topics()]
    if proverb_hash in used_hashes:
        print("[INFO] Proverb already posted previously. Skipping.")
        return

    post_content = generate_commentary(proverb_obj)
    # Optional image
    if USE_IMAGE and proverb_obj.get("link"):
        cloud_img = upload_image_to_cloudinary(proverb_obj.get("link"))
        if cloud_img:
            post_content = f"[Image]({cloud_img})\n\n" + post_content

    post_to_facebook(post_content)
    post_to_telegram(post_content)

    save_used_topic(proverb_obj['proverb'])

if __name__ == "__main__":
    run_pipeline()
