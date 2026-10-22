package app.asechka.android;

import java.util.Iterator;
import org.json.*;

/** The same optimistic shape as the shared book/keepsake APIs. */
final class BookProjection {
  static String collection(String action) {
    if (action.endsWith("Victory")) return "victories";
    if (action.endsWith("Recipe")) return "recipes";
    if (action.endsWith("Joke")) return "jokes";
    return action.endsWith("Letter") ? "letters" : "things";
  }

  static JSONObject find(JSONObject data, JSONObject body) {
    if (data == null) return null;
    if (body.optString("action").equals("saveSince")) return data.optJSONObject("since");
    JSONArray list = data.optJSONArray(collection(body.optString("action")));
    if (list != null)
      for (int i = 0; i < list.length(); i++) {
        JSONObject row = list.optJSONObject(i);
        if (row != null && row.optString("id").equals(body.optString("id"))) return row;
      }
    return null;
  }

  static void apply(JSONObject data, JSONObject body, long now) throws Exception {
    String action = body.optString("action"), key = collection(action);
    JSONObject previous = find(data, body);
    JSONObject item = previous == null ? new JSONObject() : new JSONObject(previous.toString());
    for (Iterator<String> it = body.keys(); it.hasNext(); ) {
      String field = it.next();
      if (!field.equals("action")
          && !field.equals("expectedRevision")
          && !field.equals("operationId")
          && !field.equals("photo")
          && !field.equals("removePhoto")) item.put(field, body.opt(field));
    }
    item.put("revision", body.getString("operationId"));
    item.put("pending", true);
    if (action.equals("saveSince")) {
      data.put("since", item);
      return;
    }
    if (!item.has("createdAt")) item.put("createdAt", Dates.timestamp(now));
    if (action.endsWith("Recipe")) {
      if (body.has("photo")) item.put("photoId", body.getString("operationId"));
      else if (body.optBoolean("removePhoto") || !item.has("photoId"))
        item.put("photoId", JSONObject.NULL);
    }
    JSONArray list = data.optJSONArray(key), next = new JSONArray();
    boolean inserted = false;
    if (list != null)
      for (int i = 0; i < list.length(); i++) {
        JSONObject row = list.getJSONObject(i);
        if (row.optString("id").equals(body.optString("id"))) {
          if (!action.startsWith("remove")) {
            next.put(item);
            inserted = true;
          }
        } else next.put(row);
      }
    if (!inserted && !action.startsWith("remove")) next.put(item);
    data.put(key, next);
  }
}
