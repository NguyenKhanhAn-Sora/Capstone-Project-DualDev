# Component Architecture - Server Creation Feature

## 📐 Component Hierarchy

```
MessagesPage
  └─ CreateServerModal (isOpen, onClose, onServerCreated)
      ├─ Step 1: ServerTemplateSelector
      │   └─ Template buttons (7 options)
      ├─ Step 2: ServerPurposeSelector
      │   └─ Purpose buttons (2 options)
      └─ Step 3: ServerCustomization
          ├─ Image upload
          └─ Name input
```

## 🔄 State Flow

### CreateServerModal State
```typescript
currentStep: 'template' | 'purpose' | 'customize'
selectedTemplate: ServerTemplate | null
selectedPurpose: ServerPurpose | null
isCreating: boolean
```

### Navigation Logic
```
Template Selected
  ├─ If 'custom' → Go to 'customize' (skip purpose)
  └─ Else → Go to 'purpose'

Purpose Selected → Go to 'customize'

Back Button
  ├─ From 'customize' + template='custom' → Go to 'template'
  ├─ From 'customize' + template≠'custom' → Go to 'purpose'
  └─ From 'purpose' → Go to 'template'
```

## 📡 Data Flow

### 1. User Interaction
```
User clicks "+" button
  ↓
setShowCreateServerModal(true)
  ↓
CreateServerModal renders
```

### 2. Template Selection
```
User clicks template (e.g., "Gaming")
  ↓
handleTemplateSelect('gaming')
  ↓
setSelectedTemplate('gaming')
  ↓
setCurrentStep('purpose')
```

### 3. Purpose Selection
```
User clicks purpose
  ↓
handlePurposeSelect('me-and-friends')
  ↓
setSelectedPurpose('me-and-friends')
  ↓
setCurrentStep('customize')
```

### 4. Customization & Creation
```
User enters name & uploads image
  ↓
handleCreateServer(name, avatarUrl)
  ↓
createServer API call with:
  - name
  - avatarUrl
  - template: selectedTemplate
  - purpose: selectedPurpose
  ↓
onServerCreated(serverId) callback
  ↓
handleServerCreated in MessagesPage
  ↓
Fetch server details
  ↓
Add to servers list
  ↓
Select new server
  ↓
Select first text channel
```

## 🎨 Styling Architecture

### CSS Modules Structure
```
CreateServerModal.module.css
  ├─ .modalOverlay (backdrop)
  ├─ .modalContent (main container)
  └─ .closeButton (X button)

ServerTemplateSelector.module.css
  ├─ .container
  ├─ .title
  ├─ .subtitle
  ├─ .templateList
  ├─ .templateButton
  │   ├─ .templateIcon
  │   ├─ .templateName
  │   └─ .arrow
  └─ .footer

ServerPurposeSelector.module.css
  ├─ .container
  ├─ .purposeList
  ├─ .purposeButton
  │   ├─ .purposeIcon
  │   ├─ .purposeName
  │   └─ .arrow
  └─ .footer

ServerCustomization.module.css
  ├─ .uploadSection
  │   ├─ .uploadButton
  │   ├─ .uploadPlaceholder
  │   └─ .avatar
  ├─ .inputSection
  │   ├─ .label
  │   └─ .input
  └─ .footer
      ├─ .backButton
      └─ .createButton
```

### Design Tokens
```css
/* Colors */
--bg-dark: #313338
--bg-darker: #2b2d31
--bg-darkest: #1e1f22
--text-primary: #f2f3f5
--text-secondary: #b5bac1
--text-muted: #949ba4
--primary: #5865f2
--primary-hover: #4752c4

/* Spacing */
--space-xs: 4px
--space-sm: 8px
--space-md: 12px
--space-lg: 16px
--space-xl: 24px

/* Border Radius */
--radius-sm: 4px
--radius-md: 8px
--radius-circle: 50%
```

## 🔌 API Integration

### Frontend API (`servers-api.ts`)
```typescript
createServer(
  name: string,
  description?: string,
  avatarUrl?: string,
  template?: ServerTemplate,
  purpose?: ServerPurpose
): Promise<Server>
```

### Backend Endpoint
```
POST /servers
Headers: { Authorization: 'Bearer <token>' }
Body: {
  name: string
  description?: string
  avatarUrl?: string
  template?: ServerTemplate
  purpose?: ServerPurpose
}
Response: Server
```

### Backend Flow
```
ServersController.createServer()
  ↓
ServersService.createServer()
  ↓
Create Server document
  ↓
Create default text channel
  ↓
Create default voice channel
  ↓
Update server with channel IDs
  ↓
Return server with channels
```

## 📦 Component Props

### CreateServerModal
```typescript
interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServerCreated?: (serverId: string) => void;
}
```

### ServerTemplateSelector
```typescript
interface ServerTemplateSelectorProps {
  onSelectTemplate: (template: ServerTemplate) => void;
}
```

### ServerPurposeSelector
```typescript
interface ServerPurposeSelectorProps {
  onSelectPurpose: (purpose: ServerPurpose) => void;
  onBack: () => void;
}
```

### ServerCustomization
```typescript
interface ServerCustomizationProps {
  onCreateServer: (name: string, avatarUrl?: string) => void;
  onBack: () => void;
  isCreating: boolean;
}
```

## 🎭 Animation Flow

### Modal Open
```
opacity: 0 → 1 (0.2s)
transform: translateY(20px) → translateY(0) (0.3s)
```

### Step Transitions
- Instant unmount of previous step
- Instant mount of next step
- Smooth cross-fade could be added

### Button Hover
```
background: transparent → #404249 (0.2s)
transform: none → scale(1.02) (optional)
```

## 🧪 Testing Checklist

### Unit Tests (To be implemented)
- [ ] Template selection updates state correctly
- [ ] Purpose selection updates state correctly
- [ ] Back button navigates correctly
- [ ] Custom template skips purpose step
- [ ] Form validation works
- [ ] Image upload handles errors

### Integration Tests
- [ ] Full flow from template to server creation
- [ ] API calls are made correctly
- [ ] Server appears in sidebar after creation
- [ ] Default channels are created

### E2E Tests
- [ ] User can complete entire flow
- [ ] Error messages display correctly
- [ ] Loading states work
- [ ] Modal can be closed at any step

## 🔐 Security Considerations

### Input Validation
- Server name: 1-100 characters
- Description: Max 500 characters
- Avatar: Max 5MB, image files only
- Template: Enum validation
- Purpose: Enum validation

### Authentication
- JWT token required for all API calls
- User must be authenticated to create server
- User automatically becomes server owner

### Authorization
- Only server owner can update server
- Only server owner can delete server
- Only server owner can remove members

## 📱 Responsive Design

### Breakpoints
```css
/* Mobile */
@media (max-width: 640px) {
  .modalContent {
    width: 95%;
    max-width: 100%;
  }
}

/* Tablet */
@media (min-width: 641px) and (max-width: 1024px) {
  .modalContent {
    width: 80%;
    max-width: 440px;
  }
}

/* Desktop */
@media (min-width: 1025px) {
  .modalContent {
    width: 90%;
    max-width: 440px;
  }
}
```

## 🎯 Performance Optimizations

### Already Implemented
- ✅ CSS Modules for scoped styling
- ✅ Component-level state management
- ✅ Memoized callbacks (could be added)
- ✅ Lazy loading for CallRoom component

### Future Improvements
- [ ] React.memo() for child components
- [ ] useMemo() for expensive computations
- [ ] useCallback() for event handlers
- [ ] Image compression before upload
- [ ] Debounced input validation

## 🔄 State Management Alternatives

### Current: Component State
```typescript
// Simple and sufficient for this use case
const [currentStep, setCurrentStep] = useState<Step>('template');
```

### Alternative 1: useReducer
```typescript
// Better for complex state logic
const [state, dispatch] = useReducer(serverModalReducer, initialState);
```

### Alternative 2: Context API
```typescript
// For sharing state across deep component tree
const ServerCreationContext = createContext();
```

### Alternative 3: Zustand/Redux
```typescript
// For global state management
const useServerStore = create((set) => ({ ... }));
```

---

**Note:** The current implementation uses component-level state which is perfect for this isolated modal flow. More complex state management is not needed unless the feature expands significantly.
