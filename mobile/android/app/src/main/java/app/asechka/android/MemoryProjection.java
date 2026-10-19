package app.asechka.android;

import org.json.*;

/** Apply the ordered outbox to the last shared snapshot, including conversations and edits. */
final class MemoryProjection {
  static void apply(JSONObject data, JSONObject body, long createdAt) throws Exception {
    String action = body.optString("action");
    boolean social = action.equals("setLike") || action.equals("addComment") || action.equals("removeComment");
    String collection = social ? body.optString("kind").equals("photo") ? "photos" : "quotes"
        : action.endsWith("Photo") ? "photos" : "quotes";
    JSONArray list = data.optJSONArray(collection); if (list == null) list = new JSONArray();
    String id = action.startsWith("add") && !social ? body.optString("operationId") : body.optString("id");
    JSONObject item = null; int index = -1;
    for (int i = 0; i < list.length(); i++) {
      JSONObject current = list.optJSONObject(i);
      if (current != null && (id.equals(current.optString("id")) || id.equals(current.optString("editKey")))) {
        item = current; index = i; break;
      }
    }
    if (social) {
      if (item == null) return;
      JSONObject state = item.optJSONObject("social"); if (state == null) state = new JSONObject();
      if (action.equals("setLike")) {
        JSONObject likes = state.optJSONObject("likes"); if (likes == null) likes = new JSONObject();
        likes.put(body.getString("actor"), body.getBoolean("liked")); state.put("likes", likes);
      } else {
        JSONArray comments = state.optJSONArray("comments"), next = new JSONArray();
        boolean found = false;
        if (comments != null) for (int i = 0; i < comments.length(); i++) {
          JSONObject comment = comments.getJSONObject(i);
          if (action.equals("removeComment") && comment.optString("id").equals(body.optString("commentId"))) continue;
          if (comment.optString("id").equals(body.optString("operationId"))) found = true;
          next.put(comment);
        }
        if (action.equals("addComment") && !found) next.put(OfflineStore.json(
            "id", body.getString("operationId"), "author", body.getString("actor"),
            "text", body.getString("text"), "createdAt", Dates.timestamp(createdAt), "pending", true));
        state.put("comments", next);
      }
      item.put("social", state); item.put("pending", true);
    } else if (action.startsWith("remove")) {
      JSONArray next = new JSONArray();
      for (int i = 0; i < list.length(); i++) if (i != index) next.put(list.opt(i));
      list = next;
    } else {
      if (item == null && !action.startsWith("add")) return;
      if (item == null) {
        item = OfflineStore.json("id", id, "createdAt", Dates.timestamp(createdAt)); list.put(item);
      }
      item.put("date", body.optString("date")); item.put("pending", true);
      if (action.startsWith("add") && body.has("author")) item.put("author", body.getString("author"));
      if (collection.equals("photos")) {
        item.put("caption", body.optString("caption"));
        item.put("alt", body.optString("caption", "A picture of us"));
        if (body.has("photo")) item.put("src", photoPath(body));
      } else {
        item.put("text", body.optString("text")); item.put("note", body.optString("note"));
      }
      if (action.startsWith("update") || action.startsWith("add")) {
        item.put("revision", body.getString("operationId"));
        item.put("editVersion", "local:" + body.getString("operationId"));
      }
    }
    data.put(collection, list);
  }

  static String photoPath(JSONObject body) {
    String date = body.optString("date");
    return "assets/photos/" + date.substring(0, 4) + "/" + date.substring(5, 7) + "/" + body.optString("operationId") + ".jpg";
  }
}
