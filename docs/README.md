# docs/ — Mục lục & quy ước

Thư mục này chứa **plan thực thi**, **walkthrough**, và **tài liệu nghiên cứu/phân tích**
cho Summarizerrrr. File dưới đây được cập nhật thủ công — thêm doc mới thì thêm một dòng.

## Quy ước tổ chức

Các skill `plan-to-docs` / `implement-phase` sinh ra cấu trúc **phẳng** này (đừng tách
thư mục con theo loại — sẽ đánh nhau với tooling):

```
docs/<tên-plan>.md                       ← plan / tài liệu (một nguồn sự thật)
docs/<tên-plan>/walkthrough-Phase-N.md   ← walkthrough từng pha (khi đã triển khai)
```

**Quy ước đặt tên:**
- `kebab-case`, **toàn chữ thường**, không dấu cách. Tên `.md` phải **khớp y hệt** tên
  folder walkthrough của nó.
- Hậu tố phiên bản `-vN` cho plan/tài liệu có khả năng lặp lại (`-v1`, `-v2`…).
- **Bắt buộc frontmatter** ở đầu mỗi file (README này là ngoại lệ):
  ```yaml
  ---
  type: plan | research | discussion | analysis | walkthrough
  status: done | in-progress | planned | draft | exploration | reference
  ---
  ```
  `status:` là **nguồn sự thật** về trạng thái, không phải sự hiện diện của folder walkthrough.

**Loại tài liệu:**
| Nhãn | Ý nghĩa |
|---|---|
| 📋 Plan | Kế hoạch thực thi theo pha, chạy được ở session mới |
| ✅ Plan (đã có walkthrough) | Plan kèm walkthrough → đã/đang triển khai |
| 🔬 Nghiên cứu | Khả thi / thăm dò, chưa quyết định thực thi |
| 💬 Thảo luận | Ghi chú thiết kế, chưa duyệt, chưa có plan |
| 📐 Phân tích | Mổ xẻ cơ chế/kiến trúc hiện có |
| 📝 Walkthrough | Nhật ký triển khai (thường nằm trong folder plan) |

> **Cột "Walkthrough"** phản ánh *có folder walkthrough trong docs/ hay không* — không phải
> khẳng định về trạng thái code. Với plan lẻ chưa có walkthrough, hãy kiểm tra git/branch để
> biết đã triển khai chưa.

---

## Plan (đã có walkthrough)

| Tài liệu | Walkthrough | Ghi chú |
|---|---|---|
| [chat-harness-implementation-plan](chat-harness-implementation-plan.md) | 9 phase (1–8, 6A/6B) | Nền tảng chat harness |
| [chat-message-graph](chat-message-graph.md) | 4 phase | Cấu trúc cây hội thoại (retry/edit/branch) |
| [chat-simple-sources-v1](chat-simple-sources-v1.md) | 5 phase | Nguồn dữ liệu cho chat |
| [tiptap-chat-composer](tiptap-chat-composer.md) | 3 phase | Composer TipTap |
| [dependency-upgrade-continuation-plan](dependency-upgrade-continuation-plan.md) | 5 phase | Nâng cấp dependency |
| [openrouter-catalog-crossref-v1](openrouter-catalog-crossref-v1.md) | 4 phase | Catalog OpenRouter → context window |
| [provider-settings-restructure-v1](provider-settings-restructure-v1.md) | 4 phase | Tái cấu trúc UI settings provider |
| [provider-add-flow-v1](provider-add-flow-v1.md) | 6 phase | Flow thêm provider (picker động) |
| [openai-compatible-multi-profile-v1](openai-compatible-multi-profile-v1.md) | 6 phase | Multi-profile OpenAI-compatible |
| [chat-reasoning-control-v1](chat-reasoning-control-v1.md) | 4 phase | Điều khiển reasoning trong chat *(branch hiện tại)* |
| [feature-reasoning-control-v1](feature-reasoning-control-v1.md) | 4 phase | Reasoning per-feature (Off/Low/Medium) cho Summary & Deep Dive, gỡ Thinking Level khỏi provider |

## Plan (chưa có walkthrough)

> Không có folder walkthrough, nhưng trạng thái thật lấy từ frontmatter `status:` của mỗi file.

| Tài liệu | status | Ghi chú |
|---|---|---|
| [model-context-discovery-v1](model-context-discovery-v1.md) | `done` | Tự phát hiện context-window của model (code đã có `contextWindow`) |
| [chat-model-quick-select-v1](chat-model-quick-select-v1.md) | `planned` | Chọn nhanh model trong chat (chưa thấy triển khai) |

## Nghiên cứu / Thảo luận / Phân tích

| Tài liệu | Loại | Ghi chú |
|---|---|---|
| [agent-capability-feasibility-v1](agent-capability-feasibility-v1.md) | 🔬 Nghiên cứu | Khả thi đưa năng lực agent vào extension (A / B-lite / B đầy đủ) |
| [chat-harness-discussion](chat-harness-discussion.md) | 💬 Thảo luận | Ghi chú thiết kế chat harness (chưa duyệt) |
| [chat-skill-source-and-tab-context-analysis](chat-skill-source-and-tab-context-analysis.md) | 📐 Phân tích | Skill, nguồn dữ liệu và `@[tab]` trong chat |

## Walkthrough lẻ

| Tài liệu | Ghi chú |
|---|---|
| [enhancing-system-prompt-formatting-walkthrough](enhancing-system-prompt-formatting-walkthrough.md) | Nâng cấp system instruction & refactor skill (không có plan cha) |
