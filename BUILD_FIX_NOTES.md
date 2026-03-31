# حل مشكلة الشاشة البيضاء في APK المبنية من Expo

## المشاكل التي تم إصلاحها:

### 1. **Error Boundary** ✅
- تم إضافة `ErrorBoundary` component لاكتشاف و عرض الأخطاء بدلاً من الشاشة البيضاء
- سيساعد في تحديد المشاكل المختلفة في الإنتاج

### 2. **معالجة البيانات** ✅
- تحسين `getMe()` في `src/lib/api.ts`:
  - إضافة null-safe checks للـ user data
  - معالجة أفضل للـ role-specific data
  - fallback values للحقول المهمة

### 3. **معالجة الأخطاء في تسجيل الدخول** ✅
- إضافة validation للـ auth token
- تحسين error messages
- Proper error handling و logging

### 4. **إصلاح Configuration Files** ✅
- `app.json`: إزالة الأذونات المكررة، إضافة `versionCode`
- `eas.json`: إضافة `buildType` و Android-specific configuration

## خطوات للبناء والاختبار:

```bash
cd /Users/mohamedrashad/Documents/projects/mobile

# 1. تنظيف الـ build cache
rm -rf node_modules
npm install

# 2. اختبار محلي أولاً
npx expo start
# ثم اختبر على الجهاز من android أو expo go

# 3. بناء APK جديد
eas build --platform android --profile preview

# 4. تحميل و تثبيت APK
# انتظر حتى ينتهي البناء، ثم حمل الـ APK و ثبته على جهازك
```

## ماذا لو لم تختفي الشاشة البيضاء؟

عندما تُشغل الـ APK الجديدة، ستظهر رسالة خطأ واضحة بدلاً من الشاشة البيضاء، مما سيساعد في تحديد المشكلة الحقيقية.

### خطوات إضافية للتصحيح:

1. **فحص الـ Logs:**
```bash
# بينما تشغل الـ APK
adb logcat | grep -i "error\|exception"
```

2. **التحقق من الـ API Connection:**
- تأكد من أن `EXPO_PUBLIC_API_URL` في `.env` صحيحة (حالياً: `https://attendqr.tech/api`)
- تأكد من أن Backend يعمل و يمكن الوصول إليه

3. **إعادة البناء الكاملة:**
```bash
eas build --platform android --profile preview --clear-cache
```

## الملفات المعدلة:

- ✅ `src/components/ErrorBoundary.tsx` - جديد
- ✅ `App.tsx` - إضافة ErrorBoundary wrapper
- ✅ `src/lib/api.ts` - تحسين معالجة البيانات و الأخطاء
- ✅ `app.json` - إصلاح configuration
- ✅ `eas.json` - تحسين build configuration
