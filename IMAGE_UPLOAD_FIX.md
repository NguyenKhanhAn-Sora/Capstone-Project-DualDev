# 🔧 Image Upload Fix - Server Avatar

## ❌ Vấn đề gặp phải

### Lỗi
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
Failed to upload image: Error: Unauthorized
```

### Nguyên nhân
Trong file `ServerCustomization.tsx`, function `handleImageUpload` gọi `uploadMedia` sai cách:

**❌ Code cũ (SAI):**
```typescript
const result = await uploadMedia(file);  // Thiếu token!
```

**✅ Code đúng:**
```typescript
const result = await uploadMedia({ token, file });  // Truyền cả token và file
```

### Tại sao cần token?

1. **Backend Endpoint:** `/posts/upload`
   - Có `@UseGuards(JwtAuthGuard)` ở controller level
   - Cần Authorization header với Bearer token
   - Kiểm tra `req.user` để lấy userId

2. **uploadMedia Signature:**
```typescript
export async function uploadMedia(opts: {
  token: string;  // Required!
  file: File;
}): Promise<UploadMediaResponse>
```

## ✅ Giải pháp đã áp dụng

### 1. Lấy token từ localStorage
```typescript
const [token, setToken] = useState<string>("");

useEffect(() => {
  // Get token from localStorage
  const accessToken = localStorage.getItem("accessToken") || 
                     localStorage.getItem("token") || "";
  setToken(accessToken);
}, []);
```

### 2. Kiểm tra token trước khi upload
```typescript
if (!token) {
  alert("Bạn cần đăng nhập để upload ảnh");
  return;
}
```

### 3. Truyền đúng parameters
```typescript
const result = await uploadMedia({ token, file });
setAvatarUrl(result.url);
```

## 📋 Code hoàn chỉnh

### ServerCustomization.tsx (Updated)

```typescript
"use client";

import React, { useState, useRef, useEffect } from "react";
import styles from "./ServerCustomization.module.css";
import { uploadMedia } from "@/lib/api";

interface ServerCustomizationProps {
  onCreateServer: (name: string, avatarUrl?: string) => void;
  onBack: () => void;
  isCreating: boolean;
}

export default function ServerCustomization({
  onCreateServer,
  onBack,
  isCreating,
}: ServerCustomizationProps) {
  const [serverName, setServerName] = useState("Máy chủ của Primersis");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [token, setToken] = useState<string>("");  // ✅ Added token state
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ✅ Get token on mount
  useEffect(() => {
    const accessToken = localStorage.getItem("accessToken") || 
                       localStorage.getItem("token") || "";
    setToken(accessToken);
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Vui lòng chọn file ảnh");
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      alert("Kích thước file không được vượt quá 5MB");
      return;
    }

    // ✅ Check token before upload
    if (!token) {
      alert("Bạn cần đăng nhập để upload ảnh");
      return;
    }

    setUploading(true);
    try {
      // ✅ Pass token and file as object
      const result = await uploadMedia({ token, file });
      setAvatarUrl(result.url);  // ✅ URL from Cloudinary
    } catch (error) {
      console.error("Failed to upload image:", error);
      alert("Không thể tải lên ảnh. Vui lòng thử lại.");
    } finally {
      setUploading(false);
    }
  };

  // ... rest of component
}
```

## 🔄 Luồng hoạt động upload ảnh

```
1. User chọn ảnh
   ↓
2. Validate file type (image/*) và size (< 5MB)
   ↓
3. Check token có tồn tại không
   ↓
4. uploadMedia({ token, file })
   ↓
5. Frontend: POST /posts/upload
   Headers: { Authorization: "Bearer <token>" }
   Body: FormData with file
   ↓
6. Backend: JwtAuthGuard validates token
   ↓
7. Backend: Extract file from request
   ↓
8. Backend: Upload to Cloudinary
   ↓
9. Backend: Return { url, secureUrl, ... }
   ↓
10. Frontend: setAvatarUrl(result.url)
   ↓
11. User sees preview
   ↓
12. User clicks "Tạo" → Server created with avatarUrl
```

## 🏗️ Backend Architecture

### Posts Controller
```typescript
@Controller('posts')
@UseGuards(JwtAuthGuard)  // ✅ All endpoints need JWT
export class PostsController {
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { ... }))
  async uploadMedia(
    @Req() req: Request,
    @UploadedFile() file: UploadedFile | undefined,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    if (!file) {
      throw new BadRequestException('Missing file');
    }
    return this.postsService.uploadMedia(user.userId, file);
  }
}
```

### Posts Service
```typescript
async uploadMedia(userId: string, file: UploadedFile) {
  const uploadResult = await this.cloudinaryService.uploadBuffer({
    buffer: file.buffer,
    folder: 'posts',
    resourceType: file.mimetype.startsWith('video/') ? 'video' : 
                  file.mimetype.startsWith('audio/') ? 'video' : 
                  'image',
  });
  
  return {
    url: uploadResult.url,
    secureUrl: uploadResult.secureUrl,
    publicId: uploadResult.publicId,
    resourceType: uploadResult.resourceType,
    // ...
  };
}
```

### Cloudinary Service
```typescript
async uploadBuffer(params: {
  buffer: Buffer;
  folder?: string;
  publicId?: string;
  resourceType?: 'image' | 'video' | 'raw';
  overwrite?: boolean;
}): Promise<UploadResult> {
  // Upload to Cloudinary
  // Return URL and metadata
}
```

## 🔐 Security

### Token Validation
- Token được lưu trong localStorage
- Token được gửi qua Authorization header
- Backend validate token qua JwtAuthGuard
- Nếu token invalid/expired → 401 Unauthorized

### File Validation
**Frontend:**
- File type: `image/*` only
- File size: Max 5MB

**Backend:**
- File type: image/*, video/*, audio/*
- File size: Max 15MB (configurable via env)

## 📝 Environment Variables

Backend cần các biến môi trường:

```env
# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_MAX_FILE_SIZE=15728640  # 15MB

# JWT
JWT_SECRET=your_secret
```

## 🧪 Testing

### 1. Test Upload Success
```
1. Login to app
2. Go to Messages page
3. Click "+" to create server
4. Select template
5. Select purpose
6. Click upload button
7. Select image file (< 5MB)
8. Wait for upload
9. See image preview
10. Click "Tạo"
11. Server created with avatar
```

### 2. Test Upload Errors

**No token:**
```
- Clear localStorage
- Try to upload
- Should show: "Bạn cần đăng nhập để upload ảnh"
```

**Invalid file type:**
```
- Select .pdf or .txt file
- Should show: "Vui lòng chọn file ảnh"
```

**File too large:**
```
- Select image > 5MB
- Should show: "Kích thước file không được vượt quá 5MB"
```

**Backend error:**
```
- Upload with invalid token
- Should show: "Không thể tải lên ảnh. Vui lòng thử lại."
- Console shows: Failed to upload image: Error: Unauthorized
```

## 🎯 Result

### Before Fix
```typescript
❌ await uploadMedia(file);  // 401 Unauthorized
```

### After Fix
```typescript
✅ await uploadMedia({ token, file });  // Success!
```

### Response Format
```json
{
  "url": "https://res.cloudinary.com/xxx/image/upload/v123/posts/abc.jpg",
  "secureUrl": "https://res.cloudinary.com/xxx/image/upload/v123/posts/abc.jpg",
  "publicId": "posts/abc",
  "resourceType": "image",
  "bytes": 245678,
  "format": "jpg",
  "width": 800,
  "height": 600
}
```

## 💡 Best Practices

### 1. Error Handling
```typescript
try {
  const result = await uploadMedia({ token, file });
  setAvatarUrl(result.url);
} catch (error) {
  console.error("Failed to upload image:", error);
  // Show user-friendly message
  alert("Không thể tải lên ảnh. Vui lòng thử lại.");
}
```

### 2. Loading States
```typescript
const [uploading, setUploading] = useState(false);

setUploading(true);
try {
  // upload
} finally {
  setUploading(false);  // Always reset loading state
}
```

### 3. File Validation
```typescript
// Validate before upload
if (!file.type.startsWith("image/")) {
  alert("Invalid file type");
  return;
}

if (file.size > maxSize) {
  alert("File too large");
  return;
}

if (!token) {
  alert("Not authenticated");
  return;
}
```

## 🔄 Alternative Approaches

### Approach 1: Pass token as prop (Current solution)
```typescript
// Get token in component
useEffect(() => {
  const token = localStorage.getItem("accessToken") || "";
  setToken(token);
}, []);
```

### Approach 2: Context API
```typescript
// Create AuthContext
const { token } = useAuth();
```

### Approach 3: Custom hook
```typescript
// Create useToken hook
const token = useToken();
```

### Approach 4: Axios instance
```typescript
// Configure axios with interceptor
axios.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${getToken()}`;
  return config;
});
```

## ✅ Checklist

- [x] Fix uploadMedia call to include token
- [x] Add token state to component
- [x] Get token from localStorage on mount
- [x] Validate token before upload
- [x] Handle upload errors
- [x] Show loading state
- [x] Display preview after upload
- [x] Save avatarUrl to server
- [x] No linter errors
- [x] Tested successfully

---

**Fixed by:** AI Assistant  
**Date:** February 14, 2026  
**Issue:** 401 Unauthorized on image upload  
**Solution:** Pass token to uploadMedia function
