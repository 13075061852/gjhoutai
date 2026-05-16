# Cloudflare D1 + R2 å­˜å‚¨æ¥å…¥

å½“å‰æ¥å…¥æŠŠâ€œç»“æ„åŒ–çŠ¶æ€â€å’Œâ€œäºŒè¿›åˆ¶æ–‡ä»¶â€åˆ†å¼€ï¼š

- D1ï¼šå›¾è°±åº“å…ƒæ•°æ®ã€å›¾è°±ç¼–è¾‘è®°å½•ã€æŠ å›¾ä¼šè¯çŠ¶æ€ï¼Œä»¥åŠèŠå¤©è®°å½•ã€ä¸»é¢˜ã€å¯¼èˆªçŠ¶æ€ã€åˆ†æé¡µè®¾ç½®ç­‰éæ•æ„Ÿ JSON çŠ¶æ€
- R2ï¼šå›¾è°±å›¾ç‰‡ã€æŠ å›¾åçš„ PNG ç»“æœ

## æœ¬åœ°å¼€å‘

1. åˆ›å»ºèµ„æºï¼š

```bash
npx wrangler d1 create gjhoutai
npx wrangler r2 bucket create gjhoutai-files
```

2. å°† D1 è¿”å›çš„ `database_id` å¡«å…¥ `wrangler.jsonc`
3. åˆå§‹åŒ–æ•°æ®åº“ï¼š

```bash
npx wrangler d1 migrations apply gjhoutai --local
```

4. å¯åŠ¨ Worker ä¸å‰ç«¯ï¼š

```bash
npm run dev:worker
npm run dev
```

å½“å‰é¡¹ç›®çš„ `.env.development` å·²ç›´æ¥æŒ‡å‘çº¿ä¸Š Workerï¼Œå› æ­¤æœ¬åœ°å‰ç«¯å¼€å‘ä¹Ÿä¼šè¯»å†™ä½ çš„ Cloudflare æ•°æ®ï¼š

```text
VITE_STORAGE_API_BASE=https://gjhoutai-storage.1308715689.workers.dev
```

å¦‚æœä½ ä»¥åæƒ³å®Œå…¨ç¦»çº¿è”è°ƒï¼Œå†åˆ é™¤è¯¥ç¯å¢ƒå˜é‡å¹¶å¯åŠ¨ `npm run dev:worker`ï¼Œè®© Vite é€šè¿‡ `/api` ä»£ç†åˆ° `http://127.0.0.1:8787`ã€‚

## ç”Ÿäº§éƒ¨ç½²

```bash
npx wrangler d1 migrations apply gjhoutai --remote
npx wrangler deploy
npm run build
```

éƒ¨ç½²åï¼Œå‰ç«¯é»˜è®¤é€šè¿‡ `.env.production` æŒ‡å‘å·²åˆ›å»ºçš„ Workerï¼š

```text
VITE_STORAGE_API_BASE=https://gjhoutai-storage.1308715689.workers.dev
```

å¦‚æœåç»­ä½ æŠŠå‰ç«¯ä¹Ÿéƒ¨ç½²åˆ°åŒä¸€ä¸ªåŸŸåä¸‹ï¼Œå¯ä»¥æ”¹å›åŒæº `/api/*`ã€‚

## å½“å‰è¿ç§»èŒƒå›´

- å·²è¿ç§»åˆ°äº‘ç«¯ï¼šå›¾è°±åº“ä¸Šä¼ å›¾ç‰‡ã€å›¾è°±å…ƒæ•°æ®ã€æŠ å›¾ç»“æœã€æŠ å›¾ä¼šè¯çŠ¶æ€ã€èŠå¤©è®°å½•ã€AI è°ƒç”¨æ—¥å¿—ã€ä¸»é¢˜ã€å¯¼èˆªçŠ¶æ€ã€åˆ†æé¡µè®¾ç½®
- ä»ä¿ç•™æœ¬åœ°ï¼šå‰ç«¯è¿è¡Œæ—¶ç¼“å­˜ä¸ä¸´æ—¶ UI çŠ¶æ€
- æš‚ä¸è¿ç§»ï¼šAI/API å¯†é’¥ç­‰æ•æ„Ÿé…ç½®

## ÈÏÖ¤Óë³õÊ¼»¯¹ÜÀíÔ±

µ±Ç° Worker ÒÑÒªÇóËùÓĞ `/api/state/*` Óë `/api/blob/*` ÇëÇóÏÈÍ¨¹ıµÇÂ¼»á»°Ğ£Ñé£¬Î´µÇÂ¼ÇëÇó»áÖ±½Ó·µ»Ø `401`¡£

Éú²ú»·¾³ÖÁÉÙĞèÒªÅäÖÃÁ½¸ö Worker ±äÁ¿£º

```bash
npx wrangler secret put BOOTSTRAP_ADMIN_TOKEN
npx wrangler secret put CORS_ORIGINS
```

ÆäÖĞ `CORS_ORIGINS` ÌîÔÊĞí·ÃÎÊ Worker µÄÇ°¶ËÀ´Ô´£¬¶à¸öÀ´Ô´ÓÃ¶ººÅ·Ö¸ô£¬ÀıÈç£º

```text
http://127.0.0.1:5001,https://your-frontend.example.com
```

Ê×´Î²¿Êğºó£¬ÏÈµ÷ÓÃÒ»´Î `POST /api/auth/bootstrap` ´´½¨µÚÒ»¸öÏµÍ³¹ÜÀíÔ±¡£¸Ã½Ó¿ÚÖ»ÓĞÔÚÊı¾İ¿â»¹Ã»ÓĞÈÎºÎÓÃ»§Ê±¿ÉÓÃ£¬²¢ÇÒ±ØĞëĞ¯´ø£º

```text
Authorization: Bearer <BOOTSTRAP_ADMIN_TOKEN>
```

ÇëÇóÌåÊ¾Àı£º

```json
{
  "username": "admin",
  "displayName": "ÏµÍ³¹ÜÀíÔ±",
  "password": "ÖÁÉÙ10Î»µÄ³õÊ¼ÃÜÂë"
}
```

Ö®ºóĞÂÕËºÅÖ»ÄÜÓÉÏµÍ³¹ÜÀíÔ±Í¨¹ı `/api/users` ´´½¨£¬²»ÔÙ¿ª·Å¹«¿ª×¢²á¡£
