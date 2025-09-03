#!/usr/bin/env python3
# ai_nwanne_pipeline_fb_telegram.py
# African wisdom daily bot: fetch, generate commentary, handle images, post to FB + Telegram

import os
import json
import hashlib
import requests
import feedparser
from datetime import datetime, timedelta
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

# Feed & posting limits
FEED_HOURS_BACK = 72
MAX_POSTS_PER_RUN = 2

# Wisdom Sources (RSS feed URLs)
WISDOM_FEEDS = [
    "https://www.afriprov.com/rss",
    "https://feeds.buzzsprout.com/2464633.rss",
    "https://newafricanmagazine.com/feed",
    "https://africa.com/feed",
    "https://allafrica.com/misc/tools/rss.html"
]

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

def fetch_wisdom_from_feeds():
    entries = []
    cutoff_time = datetime.utcnow() - timedelta(hours=FEED_HOURS_BACK)
    for feed_url in WISDOM_FEEDS:
        try:
            feed = feedparser.parse(feed_url)
            for entry in feed.entries:
                title = entry.get("title", "").strip()
                summary = entry.get("summary", "").strip()
                link = entry.get("link", "").strip()

                published_parsed = entry.get("published_parsed") or entry.get("updated_parsed")
                if published_parsed:
                    entry_time = datetime(*published_parsed[:6])
                    if entry_time < cutoff_time:
                        continue

                if title:
                    entries.append({"title": title, "summary": summary, "link": link})

        except Exception as e:
            print(f"[WARN] Failed to parse feed {feed_url}: {e}")

    return entries[:MAX_POSTS_PER_RUN]

# ------------------- AUTOMATIC COMMENTARY -------------------

def automatic_commentary(title, summary):
    """Generate simple commentary without OpenAI, with fallback if summary is missing."""
    if summary:
        comments = [
            f"Reflect on this: {title}.",
            f"This proverb teaches us: {summary}",
            "Share and spread African culture with your friends!"
        ]
    else:
        comments = [
            f"Reflect on this African wisdom: {title}.",
            "Consider how this saying can guide your day.",
            "Share this knowledge and inspire others!"
        ]
    return comments

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
    resp = requests.post(url, json=payload)
    if resp.ok:
        print(f"✅ Posted to Telegram: {resp.json()['result']['message_id']}")
        return resp.json()
    else:
        print(f"❌ Telegram error: {resp.text}")
        return None

# ------------------- MAIN PIPELINE -------------------

def run_pipeline():
    wisdom_entries = fetch_wisdom_from_feeds()
    if not wisdom_entries:
        print("[INFO] No new wisdom entries found in feeds.")
        return

    posted_hashes = set()
    posts_done = 0

    for entry in wisdom_entries:
        if posts_done >= MAX_POSTS_PER_RUN:
            break
        try:
            title = entry["title"]
            summary = entry.get("summary", "")
            link = entry.get("link", "")

            # Deduplicate by title hash
            content_hash = hash_text(title)
            if content_hash in posted_hashes:
                continue
            posted_hashes.add(content_hash)

            # Save used topic to avoid future duplicates
            save_used_topic(title)

            # Generate automatic commentary
            commentary_lines = automatic_commentary(title, summary)

            # Optional image
            img_text = ""
            if USE_IMAGE and link:
                cloud_img = upload_image_to_cloudinary(link)
                if cloud_img:
                    img_text = f'[Image]({cloud_img})\n\n'

            # Assemble post
            fb_post = "\n".join([f"Proverb: {title}", f"Explanation: {summary}"] + commentary_lines + ["", " ".join(FIXED_HASHTAGS)])
            if img_text:
                fb_post = img_text + fb_post

            # Telegram MarkdownV2 safe
            tg_post = fb_post
            for ch in r"_*[]()~`>#+-=|{}.!":
                tg_post = tg_post.replace(ch, f"\\{ch}")

            # Post to platforms
            post_to_facebook(fb_post)
            post_to_telegram(tg_post)

            posts_done += 1

        except Exception as e:
            print(f"[ERROR] Pipeline failed for entry {entry}: {e}")

if __name__ == "__main__":
    run_pipeline()
