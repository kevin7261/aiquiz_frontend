# 後端修正：Quiz.rag_id、Answer.quiz_id / course_name

前端已修正（會傳 `quiz_id`、`course_name` 給評分 API，並在產生 quiz 時傳 `course_name`，卡片會儲存 `quiz_id`）。

請在 **aiquiz_backend** 專案中手動修改 `routers/grade.py` 兩處：

---

## 1. generate_quiz_api：Rag 查詢加上 rag_id

**約第 234 行**，把：

```python
rag_rows = supabase.table("Rag").select("llm_api_key, system_prompt_instruction, person_id").eq("file_id", file_id).eq("deleted", False).execute()
```

改成：

```python
rag_rows = supabase.table("Rag").select("llm_api_key, system_prompt_instruction, person_id, rag_id").eq("file_id", file_id).eq("deleted", False).execute()
```

---

## 2. generate_quiz_api：寫入 Quiz 時帶入 rag_id

**約第 273–276 行**，把：

```python
        # 寫入 public.Quiz 表
        quiz_row: dict[str, Any] = {
            "file_id": file_id,
```

改成：

```python
        # 寫入 public.Quiz 表（須帶入 rag_id，與 Rag 表對應）
        rag_id = int(row.get("rag_id") or 0) if isinstance(row, dict) else 0
        quiz_row: dict[str, Any] = {
            "rag_id": rag_id,
            "file_id": file_id,
```

---

完成後，Quiz 表會正確寫入 `rag_id`，Answer 表會由前端傳入的 `quiz_id`、`course_name` 正確寫入。
