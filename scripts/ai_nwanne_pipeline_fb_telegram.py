#!/usr/bin/env python3
# ai_nwanne_pipeline_fb_telegram.py
# African wisdom daily bot: fetch multiple fresh proverbs, generate commentary, post to FB + Telegram

import os
import random
import requests
from dotenv import load_dotenv

load_dotenv()

# ------------------- CONFIG -------------------

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

# Number of proverbs to fetch per run
NUM_PROVERBS_PER_RUN = 3

# ------------------- AFRICAN PROVERBS API -------------------

API_URL_RANDOM = "https://africanproverbs.onrender.com/api/proverb"

def fetch_random_proverb():
    """
    Fetch a single random African proverb.
    """
    try:
        resp = requests.get(API_URL_RANDOM)
        if resp.ok:
            data = resp.json()
            proverb = data.get("proverb", "")
            interpretation = data.get("interpretation", "")
            native = data.get("native", "")
            translation = ""
            translations = data.get("translations", [])
            if translations:
                translation = translations[0].get("proverb", "")
            return {
                "proverb": proverb,
                "interpretation": interpretation,
                "native": native,
                "translation": translation
            }
        else:
            print(f"[ERROR] Failed to fetch proverb: {resp.status_code}")
            return None
    except Exception as e:
        print(f"[ERROR] Exception fetching proverb: {e}")
        return None

# ------------------- COMMENTARY GENERATION -------------------

EMOJIS = ["🌍", "💡", "📝", "🗣️", "✨", "🔥", "🌿", "🌞", "🌟", "📜"]

def generate_commentary(proverb_obj):
    """
    Generate engaging commentary for the proverb with random emojis.
    """
    # pick 3 random emojis for this post
    emoji_sample = random.sample(EMOJIS, 3)
    commentary = f"{emoji_sample[0]} Proverb: {proverb_obj['proverb']}\n\n"
    commentary += f"{emoji_sample[1]} Interpretation: {proverb_obj['interpretation']}\n"
    if proverb_obj['native']:
        commentary += f"{emoji_sample[2]} Native: {proverb_obj['native']}\n"
    if proverb_obj['translation']:
        commentary += f"🔤 Translation: {proverb_obj['translation']}\n"
    commentary += "\n✨ Share and spread African wisdom!\n"
    commentary += " ".join(FIXED_HASHTAGS)
    return commentary

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
    # Escape Telegram MarkdownV2 special characters
    for ch in r"_*[]()~`>#+-=|{}.!":
        content = content.replace(ch, f"\\{ch}")

    url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TG_CHAT_ID,
        "text": content,
        "parse_mode": "MarkdownV2",
        "disable_web_page_preview": True
    }
    resp = requests.post(url, json=payload)
    if resp.ok:
        print(f"✅ Posted to Telegram: {resp.json()['result']['message_id']}")
        return resp.json()
    else:
        print(f"❌ Telegram error: {resp.text}")
        return None

# ------------------- MAIN PIPELINE -------------------

def run_pipeline():
    for _ in range(NUM_PROVERBS_PER_RUN):
        proverb_obj = fetch_random_proverb()
        if not proverb_obj:
            print("[WARN] No proverb fetched.")
            continue

        content = generate_commentary(proverb_obj)

        # Optional image
        if USE_IMAGE and proverb_obj.get("link"):
            cloud_img = upload_image_to_cloudinary(proverb_obj["link"])
            if cloud_img:
                content = f"[Image]({cloud_img})\n\n" + content

        post_to_facebook(content)
        post_to_telegram(content)

if __name__ == "__main__":
    run_pipeline()
