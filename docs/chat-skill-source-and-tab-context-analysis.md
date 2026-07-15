---
type: analysis
status: reference
---

# Phân tích Skill, nguồn dữ liệu và `@[tab]` trong Chat

## Phạm vi tài liệu

Tài liệu này chốt cách hiểu về ba khái niệm trong tính năng Chat:

1. Skill quyết định nhiệm vụ AI cần thực hiện như thế nào.
2. Nguồn dữ liệu quyết định AI được đọc nội dung gì.
3. `@[tab]` cho phép người dùng bổ sung các tab cụ thể vào context của lượt chat.

Đây là tài liệu phân tích sản phẩm và kiến trúc. Tài liệu chưa phải implementation plan và không mô tả thứ tự triển khai.

## 1. Vấn đề của mô hình hiện tại

Trong luồng summarize cũ, ứng dụng đã phân biệt nội dung theo loại trang:

- YouTube dùng transcript có timestamp.
- Udemy và Coursera dùng course transcript.
- Trang thông thường dùng nội dung webpage.
- Phân tích comment YouTube là một thao tác riêng: lấy comment và reply, format dữ liệu rồi mới gửi cho AI.

Trong Chat, skill hiện chủ yếu là instruction. Nếu hệ thống chỉ thay prompt nhưng luôn lấy webpage text thì các skill không nhận đúng nguồn:

- `Summarize` trên YouTube có thể tóm tắt DOM thay vì nội dung video.
- `Analyze`, `Explain`, `Debate` trên YouTube cũng có thể phân tích DOM thay vì transcript.
- `Chapter Summary` không được bảo đảm có transcript và timestamp.
- `Comment Analysis` có instruction phân tích comment nhưng chưa chắc context chứa comment.

Vấn đề cốt lõi vì vậy không phải chỉ là thiếu một skill `YouTube Summary`. Vấn đề là skill và nguồn dữ liệu chưa được mô hình hóa thành hai phần độc lập.

## 2. Phân biệt Skill, Source Capability và AI Tool

### Skill

Skill mô tả ý định và phương pháp xử lý của AI, ví dụ:

- Summarize
- Analyze
- Explain
- Debate
- Translate
- Chapter Summary
- Comment Analysis
- Skill do người dùng tự tạo

Skill nên chứa instruction và lựa chọn nguồn mặc định. Skill không nên tự chứa code lấy transcript hoặc comment.

### Source capability

Source capability là khả năng của ứng dụng dùng để lấy dữ liệu trước khi gọi model, ví dụ:

- `webpage`
- `youtubeTranscript`
- `youtubeComments`
- `youtubeTranscriptAndComments`
- `courseTranscript`
- `none`

Đây là thao tác deterministic do ứng dụng điều phối. Ứng dụng biết tab hiện tại, loại trang và cấu hình skill nên có thể quyết định nguồn trước khi gửi request cho model.

### AI tool

AI tool là công cụ để model tự quyết định gọi trong quá trình suy luận. Cơ chế này chưa cần thiết cho việc lấy transcript/comment ở phiên bản đầu vì:

- Loại trang đã được ứng dụng biết trước.
- Người dùng hoặc skill đã chọn nguồn rõ ràng.
- Cho model tự quyết định sẽ làm hành vi khó dự đoán hơn giữa các provider.
- Có thể phát sinh thêm vòng tool call, độ trễ và lỗi.

Vì vậy, cách gọi phù hợp hơn là `sourceMode`, `sourceRequirement` hoặc `requiredCapabilities`, không phải nhúng AI tool vào prompt của skill.

## 3. Người dùng tạo skill có được chọn nguồn không?

Có. Người dùng nên được chọn nguồn bằng một trường cấu hình có cấu trúc trong Skill Editor.

Các lựa chọn hợp lý:

- `Tự động theo trang`
- `Nội dung trang web`
- `YouTube transcript`
- `YouTube comments`
- `Transcript + comments`
- `Course transcript`
- `Không tự lấy nguồn`

Ví dụ về mặt dữ liệu:

```js
{
  name: 'Phân tích phản ứng người xem',
  instruction: 'So sánh nội dung video với ý kiến của người xem.',
  sourceMode: 'youtubeTranscriptAndComments'
}
```

Đây là quyền lựa chọn rõ ràng của người dùng, không phải model tự ý lấy comment. Do đó user-created skill hoàn toàn có thể sử dụng transcript hoặc comment.

Điểm cần tránh là suy đoán capability từ instruction tự do. Ví dụ, hệ thống không nên chỉ thấy câu “hãy lấy comment” trong prompt rồi tự cấp khả năng gọi comment bridge. Nguồn phải đến từ trường cấu hình `sourceMode` hoặc lựa chọn trực tiếp trên UI.

### Khi nguồn không khả dụng

Ứng dụng phải kiểm tra điều kiện ở thời điểm chạy skill:

- Chọn YouTube transcript trên video YouTube: hợp lệ.
- Chọn YouTube comments trên trang YouTube watch: hợp lệ nếu comment khả dụng.
- Chọn YouTube transcript trên trang bài viết: không hợp lệ.
- Chọn comment trên video bị tắt comment: không hợp lệ.
- Chọn comment trên loại trang không hỗ trợ: không hợp lệ.

Không nên âm thầm thay comment bằng webpage text vì hai nguồn có ý nghĩa hoàn toàn khác nhau. Với các nguồn đặc thù như transcript và comment, mặc định nên báo lỗi rõ ràng.

Nếu sau này hỗ trợ fallback, fallback phải là lựa chọn riêng của người dùng, ví dụ:

```js
{
  sourceMode: 'youtubeTranscript',
  sourceFallback: 'error'
}
```

## 4. `Auto` phải hoạt động cho mọi skill

Việc chọn nguồn theo loại trang phải nằm ở tầng chung của Chat, không nằm riêng trong `Summarize`.

Quy tắc `Auto`:

| Loại trang | Nguồn mặc định |
| --- | --- |
| YouTube watch/live | YouTube transcript |
| Udemy/Coursera được hỗ trợ | Course transcript |
| Trang thông thường | Webpage content |

Do đó, trên YouTube:

- `Summarize` dùng transcript.
- `Analyze` dùng transcript.
- `Explain` dùng transcript.
- `Debate` dùng transcript.
- `Translate` dùng transcript.
- Custom skill có `sourceMode: auto` dùng transcript.

Comments không thuộc `Auto`. Comments là phản ứng của khán giả, không phải nội dung chính của video. Hệ thống chỉ lấy comment khi skill hoặc người dùng yêu cầu rõ.

### Nguồn mặc định đề xuất cho built-in skills

| Skill | Nguồn mặc định |
| --- | --- |
| Summarize | Auto |
| Analyze | Auto |
| Explain | Auto |
| Debate | Auto |
| Translate | Auto |
| Chapter Summary | YouTube transcript |
| Comment Analysis | YouTube comments |
| Course Concepts | Course transcript |
| Custom skill | Người dùng chọn, mặc định Auto |

## 5. Có cần built-in `YouTube Summary` riêng không?

Không cần một implementation riêng để YouTube hoạt động đúng.

`Summarize + Auto` đã phải tự động dùng transcript khi tab là YouTube. Đây mới là hành vi nền tảng cần bảo đảm.

Một built-in `YouTube Summary` vẫn có thể tồn tại như:

- Shortcut dễ khám phá trong UI.
- Preset có instruction chuyên cho video.
- Skill bắt buộc transcript và có quy tắc timestamp rõ ràng.

Tuy nhiên nó chỉ nên tái sử dụng capability `youtubeTranscript`. Không nên có một luồng lấy transcript hoặc gọi model riêng.

## 6. Comment Analysis phải là thao tác chủ động

Lấy comment khác với lấy transcript:

- Có thể cần phân trang.
- Có thể lấy cả reply.
- Có độ trễ đáng kể.
- Có thể thất bại do comment bị tắt hoặc bridge không khả dụng.
- Tập comment được lấy chỉ là một mẫu, không đại diện chắc chắn cho toàn bộ người xem.

Vì vậy:

- `Summarize` không tự lấy comment.
- `Analyze` với Auto không tự lấy comment.
- Free-form chat không tự lấy comment.
- `Comment Analysis` lấy comment vì người dùng đã chọn rõ.
- Custom skill có source comments được phép lấy comment.
- Skill `Transcript + comments` lấy cả hai vì người dùng đã yêu cầu rõ.

Kết quả phân tích comment cần nói rõ số comment/reply đã lấy và thời điểm lấy, đồng thời tránh khẳng định đó là ý kiến của toàn bộ cộng đồng.

## 7. Ý nghĩa của `@[tab]`

`@[tab]` thêm một tab cụ thể làm nguồn context cho lượt chat. Nó không nên chỉ nhét DOM text của tab vào prompt.

Mặc định:

```text
Tab hiện tại = nguồn chính
@[tab]       = nguồn được người dùng bổ sung
```

Ví dụ, người dùng đang ở Video A và nhập:

```text
So sánh quan điểm trong video này với @Video B.
```

Context mong muốn:

```text
Nguồn 1 — Current tab
YouTube transcript của Video A

Nguồn 2 — Mentioned tab
YouTube transcript của Video B
```

Không nên dùng DOM của Video B chỉ vì nó được thêm qua `@[tab]`.

## 8. Nguồn mặc định của một tab được mention

Mỗi tab phải được resolve độc lập theo loại trang:

| Tab được mention | Context mặc định |
| --- | --- |
| YouTube watch/live | Transcript |
| Udemy/Coursera được hỗ trợ | Course transcript |
| Trang bài viết | Webpage content |
| Trang không đọc được | Báo lỗi trên source chip |
| YouTube comments | Chỉ khi skill hoặc người dùng yêu cầu |

Ví dụ:

```text
@YouTube A → youtubeTranscript
@Article B → webpage
@Udemy C   → courseTranscript
```

## 9. Skill và `@[tab]` phối hợp như thế nào?

Thứ tự ưu tiên nguồn nên là:

```text
Override riêng trên source chip
→ Source mode của skill
→ Auto theo loại trang
```

### Skill dùng Auto

Người dùng chạy:

```text
/Analyze So sánh video này với @Video B và @Article C.
```

Context:

```text
Current YouTube → transcript
@Video B        → transcript
@Article C      → webpage
```

Cùng một instruction `Analyze` được áp dụng trên toàn bộ nguồn.

### Skill bắt buộc một loại nguồn

Với `Comment Analysis`, nếu người dùng nhập:

```text
/Comment Analysis So sánh phản ứng khán giả giữa @Video A và @Video B.
```

Hệ thống lấy comments của cả hai video. Nếu một attachment là trang bài viết, hệ thống phải báo attachment đó không hỗ trợ YouTube comments, không được tự chuyển sang webpage.

### Skill kết hợp transcript và comments

Một custom skill có thể yêu cầu cả hai:

```text
Current Video A
├── transcript
└── comments

@Video B
├── transcript
└── comments
```

Điều này phù hợp cho các tác vụ như so sánh điều video nói với phản ứng của người xem hoặc so sánh phản ứng giữa nhiều video.

## 10. Override nguồn trên source chip

Sau khi người dùng chọn một tab, source chip nên cho biết loại nguồn sẽ được lấy:

```text
[ Video B · Auto: Transcript ▾ ]
```

Người dùng có thể đổi thành:

- Auto
- Transcript
- Comments
- Web page
- Transcript + comments
- Remove

Skill cung cấp nguồn mặc định. Source chip cho phép override cho riêng lượt chat hoặc riêng tab đó.

Ví dụ, trên một tab YouTube:

- Chọn Transcript để hỏi về nội dung video.
- Chọn Comments để hỏi về phản ứng khán giả.
- Chọn Web page để hỏi về description hoặc metadata hiển thị trên trang.
- Chọn Transcript + comments để đối chiếu nội dung và phản ứng.

## 11. Source bindings thay vì danh sách ID đơn giản

Quan hệ giữa message và source cần mang nhiều thông tin hơn một source ID:

```js
{
  sourceId: 'source-123',
  origin: 'tabMention',
  role: 'explicitAttachment',
  sourceKind: 'youtubeTranscript',
  tabIdHint: 42
}
```

Các role hữu ích:

- `activeTab`: nguồn tự động từ tab hiện tại.
- `explicitAttachment`: nguồn người dùng thêm bằng `@[tab]`.
- `conversationHistory`: nguồn được giữ lại từ các lượt trước.

`isActive` hoặc role không nên là thuộc tính cố định của source snapshot vì cùng một snapshot có thể là active tab ở lượt này nhưng là attachment hoặc historical source ở lượt khác. Vai trò thuộc về quan hệ giữa message và source.

## 12. Context gửi cho model

Mỗi nguồn phải được bọc thành một block riêng có provenance rõ ràng:

```text
SOURCE A
Role: current-tab
Title: Video A
URL: ...
Kind: youtubeTranscript
Language: vi
Captured at: ...
Content:
[timestamped transcript]

SOURCE B
Role: mentioned-tab
Title: Video B
URL: ...
Kind: youtubeComments
Fetched comments: 60
Fetched replies: 34
Captured at: ...
Content:
[formatted comments]
```

Model cần phân biệt được:

- Nguồn nào là tab hiện tại.
- Nguồn nào do người dùng mention.
- Nguồn là transcript, webpage hay comments.
- Transcript dùng ngôn ngữ nào và có timestamp hay không.
- Comments gồm bao nhiêu comment/reply và được lấy khi nào.

`tabId` là thông tin nội bộ và không cần gửi cho model.

Mỗi source vẫn phải được coi là untrusted content để nội dung trang không thể giả làm system instruction hoặc skill instruction.

## 13. Lưu context cho các lượt tiếp theo

Các source được lấy từ tab nên được lưu thành immutable snapshot và gắn với user message.

Ví dụ:

```text
Turn 1:
So sánh video hiện tại với @Video B.

Turn 2:
Điểm nào hai người nói mâu thuẫn nhau?
```

Turn 2 vẫn có thể dùng hai transcript snapshot từ Turn 1. Hệ thống không cần fetch lại sau mỗi câu hỏi.

Source drawer nên cho phép:

- Xem loại nguồn và provenance.
- Refresh transcript.
- Refresh comments.
- Xóa source khỏi conversation.

Comments cần hiển thị `fetchedAt` rõ ràng vì phản ứng khán giả có thể thay đổi theo thời gian.

## 14. Navigation và tính đúng đắn của tab mention

Khi người dùng chọn một tab, ứng dụng nên ghi lại tab ID, URL và title tại thời điểm chọn. Trước và sau khi capture cần kiểm tra tab vẫn ở cùng tài nguyên.

Nếu tab đã chuyển trang hoặc đóng:

- Không lấy nội dung của trang mới một cách im lặng.
- Không gắn snapshot sai title/URL.
- Hiển thị lỗi để người dùng chọn lại tab.

Với YouTube, định danh tài nguyên nên dựa vào video ID hoặc canonical URL, tránh coi thay đổi query như timestamp/tracking parameter là một video hoàn toàn mới.

## 15. Cache và provenance

Cache không thể chỉ dùng tab ID hoặc URL. Một video có thể sinh ra nhiều nguồn độc lập:

```text
Video A
├── transcript tiếng Việt
├── transcript tiếng Anh
├── 20 comments, 0 replies
├── 60 comments, 10 replies/comment
└── webpage text
```

Cache identity cần xét tối thiểu:

- Tab/resource identity.
- Source kind.
- Transcript language.
- Comment limit.
- Reply limit.
- Các option ảnh hưởng đến nội dung capture.

Transcript và comments phải là hai snapshot riêng, có source kind, metadata và thời điểm capture riêng.

## 16. Phân bổ context khi có nhiều `@[tab]`

Không nên để source đầu tiên dùng hết token rồi loại source sau. Điều đó đặc biệt sai với yêu cầu so sánh.

Thứ tự ưu tiên hợp lý:

1. Source được mention rõ trong lượt hiện tại.
2. Source của current tab do skill yêu cầu.
3. Source từ các lượt chat trước còn liên quan.
4. Source lịch sử cũ hơn.

Khi có nhiều source dài, hệ thống nên condense từng source riêng và dành ngân sách tối thiểu cho từng nguồn:

```text
Video A transcript → condensed riêng
Video B transcript → condensed riêng
Article C          → condensed riêng
```

Nếu một source bị cắt hoặc bị loại, cả model và UI phải nhận warning. Model không nên tuyên bố đã so sánh tất cả nguồn nếu thực tế một nguồn không được đưa vào context.

## 17. Quy tắc tổng thể được đề xuất

```text
Skill
├── Instruction
├── Default source mode
└── Áp dụng nhiệm vụ lên các nguồn của lượt chat

Current tab
├── Nguồn chính
└── Resolve theo skill hoặc Auto

@[tab]
├── Thêm nguồn cụ thể
├── Resolve theo skill hoặc Auto
└── Có thể override source riêng trên chip
```

Ví dụ custom skill tối giản:

```js
{
  name: 'Compare arguments',
  instruction: 'Compare claims, evidence and disagreements across sources.',
  sourceMode: 'auto'
}
```

Người dùng có thể chạy:

```text
/Compare arguments @Video A @Video B @Article C
```

Hệ thống tự lấy hai transcript và một webpage, gắn provenance riêng và phân bổ context để model thực sự có thể so sánh cả ba nguồn.

## 18. Các quyết định chính

1. Skill và nguồn dữ liệu là hai khái niệm độc lập.
2. User-created skill được chọn nguồn bằng cấu hình có cấu trúc.
3. `Auto` áp dụng cho mọi skill, không chỉ `Summarize`.
4. Mọi skill dùng Auto trên YouTube đều nhận transcript.
5. Comments luôn là nguồn chủ động, không thuộc Auto.
6. `YouTube Summary` có thể là preset UI nhưng không cần implementation riêng.
7. `@[tab]` thêm typed source context, không mặc định thêm DOM text.
8. Skill source mode mặc định áp dụng cho current tab và các tab được mention.
9. Người dùng có thể override nguồn trên từng source chip.
10. Source snapshot và vai trò của source trong message phải được lưu riêng.
11. Nhiều source trong cùng lượt phải được phân bổ context công bằng.
12. Khi nguồn không khả dụng, hệ thống báo lỗi rõ ràng và không tự thay bằng nguồn khác sai nghĩa.
