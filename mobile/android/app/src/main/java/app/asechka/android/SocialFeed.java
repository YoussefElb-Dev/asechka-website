package app.asechka.android;

import android.content.*;
import android.graphics.*;
import android.graphics.drawable.*;
import android.view.*;
import android.widget.*;
import java.util.*;
import org.json.*;

/** A recycling native post feed: only visible photos and quotes have views or animation work. */
final class SocialFeed extends ListView {
  interface Host {
    String actor();

    Images feedImages();

    void createPost(boolean photo);

    void react(Post post, boolean liked, View anchor);

    void comments(Post post);

    void explore(Post post);

    void more(Post post, View anchor);

    boolean saved(Post post);

    void savePost(Post post);

    void refreshFeed();
  }

  static final class Post {
    final JSONObject value;
    final String kind, id;
    final int index;
    int backgroundIndex;

    Post(JSONObject value, String kind, int index) {
      this.value = value;
      this.kind = kind;
      this.index = index;
      id = value.optString("id", value.optString("editKey"));
    }

    String key() {
      return kind + ":" + id;
    }

    String author() {
      return value.optString("author", "us");
    }

    String name() {
      return nameOf(author());
    }

    boolean liked(String actor) {
      JSONObject social = value.optJSONObject("social");
      JSONObject likes = social == null ? null : social.optJSONObject("likes");
      return likes != null && likes.optBoolean(actor);
    }

    JSONArray comments() {
      JSONObject social = value.optJSONObject("social");
      JSONArray comments = social == null ? null : social.optJSONArray("comments");
      return comments == null ? new JSONArray() : comments;
    }

    String source() {
      return value.optString("src").startsWith("assets/photos/") && !id.isEmpty()
          ? "/api/together-photo?kind=memory&id="
              + id
              + "&v="
              + value.optString("revision", value.optString("contentHash", id))
          : value.optString("src");
    }
  }

  static String nameOf(String actor) {
    return actor.equals("asnat") ? "Asnat" : actor.equals("youssef") ? "Youssef" : "Our little us";
  }

  final int mode;
  private final Host host;
  private final Ui u;
  private final FeedAdapter adapter;
  private final ArrayList<Post> posts = new ArrayList<>();
  private boolean onlySaved;
  private TextView empty;
  private float pullStart;
  private boolean pulling;

  SocialFeed(Context context, Host host, int mode, View header) {
    super(context);
    this.host = host;
    this.mode = mode;
    u = new Ui(context);
    setBackgroundColor(Ui.BG);
    setDivider(null);
    setDividerHeight(0);
    setSelector(new android.graphics.drawable.ColorDrawable(Color.TRANSPARENT));
    setVerticalScrollBarEnabled(false);
    setClipToPadding(false);
    setPadding(0, 0, 0, u.dp(12));
    setOverScrollMode(OVER_SCROLL_IF_CONTENT_SCROLLS);
    addHeaderView(header, null, false);
    LinearLayout end = u.column();
    end.setPadding(u.dp(24), u.dp(28), u.dp(24), u.dp(30));
    empty = u.text("All caught up. More little moments soon. ♡", 13, Ui.MUTED);
    empty.setGravity(Gravity.CENTER);
    end.addView(empty);
    addFooterView(end, null, false);
    adapter = new FeedAdapter();
    setAdapter(adapter);
    setRecyclerListener(
        view -> {
          if (view.getTag() instanceof Holder) {
            Holder holder = (Holder) view.getTag();
            holder.photo.setImageDrawable(null);
            holder.quoteBackdrop.setImageDrawable(null);
            holder.backdropSource = "";
            holder.source = "";
          }
        });
    setOnTouchListener(
        (view, event) -> {
          if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
            pulling =
                getFirstVisiblePosition() == 0
                    && getChildCount() > 0
                    && getChildAt(0).getTop() >= 0;
            pullStart = event.getY();
          } else if (event.getActionMasked() == MotionEvent.ACTION_UP && pulling) {
            if (event.getY() - pullStart > u.dp(110)) {
              Motion.haptic(this, false);
              host.refreshFeed();
            }
            pulling = false;
          }
          return false;
        });
  }

  void savedOnly(boolean saved) {
    onlySaved = saved;
  }

  void submit(JSONObject data, boolean keep) {
    int position = getFirstVisiblePosition();
    int top = getChildCount() == 0 ? 0 : getChildAt(0).getTop();
    String anchor =
        position > 0 && position - 1 < posts.size() ? posts.get(position - 1).key() : "";
    posts.clear();
    if (data != null)
      for (String collection : new String[] {"photos", "quotes"}) {
        if (mode == 1 && collection.equals("quotes") || mode == 5 && collection.equals("photos"))
          continue;
        JSONArray list = data.optJSONArray(collection);
        if (list == null) continue;
        for (int i = 0; i < list.length(); i++) {
          Object raw = list.opt(i);
          JSONObject value =
              raw instanceof JSONObject ? (JSONObject) raw : OfflineStore.json("text", raw);
          Post post = new Post(value, collection.equals("photos") ? "photo" : "quote", i);
          if (!onlySaved || host.saved(post)) posts.add(post);
        }
      }
    Collections.sort(
        posts,
        (a, b) -> {
          int time = b.value.optString("date").compareTo(a.value.optString("date"));
          if (time == 0)
            time = b.value.optString("createdAt").compareTo(a.value.optString("createdAt"));
          if (time == 0) time = Integer.compare(b.index, a.index);
          return time;
        });
    int previousBackground = -1;
    for (Post post : posts) {
      if (post.kind.equals("quote")) {
        post.backgroundIndex =
            QuoteBackgrounds.next(
                post.id.isEmpty() ? post.value.optString("text") : post.id, previousBackground);
        previousBackground = post.backgroundIndex;
      }
    }
    empty.setText(
        posts.isEmpty()
            ? onlySaved
                ? "Save a post with the bookmark to find it here."
                : "Our next favorite moment starts with you. Create a photo or quote above."
            : "All caught up. More little moments soon. ♡");
    adapter.notifyDataSetChanged();
    if (keep) {
      for (int i = 0; i < posts.size(); i++)
        if (posts.get(i).key().equals(anchor)) {
          position = i + 1;
          break;
        }
      setSelectionFromTop(Math.min(position, posts.size() + 1), top);
    } else setSelection(0);
  }

  ArrayList<Post> items() {
    return new ArrayList<>(posts);
  }

  private final class FeedAdapter extends BaseAdapter {
    public int getCount() {
      return posts.size();
    }

    public Post getItem(int position) {
      return posts.get(position);
    }

    public long getItemId(int position) {
      long hash = 1469598103934665603L;
      for (char c : getItem(position).key().toCharArray()) hash = (hash ^ c) * 1099511628211L;
      return hash;
    }

    public boolean hasStableIds() {
      return true;
    }

    public int getViewTypeCount() {
      return 2;
    }

    public int getItemViewType(int position) {
      return getItem(position).kind.equals("photo") ? 0 : 1;
    }

    public View getView(int position, View recycled, ViewGroup parent) {
      Holder holder;
      if (recycled == null) {
        holder = new Holder(getItemViewType(position) == 0);
        recycled = holder.root;
      } else holder = (Holder) recycled.getTag();
      holder.bind(getItem(position));
      return recycled;
    }
  }

  private final class Holder {
    final LinearLayout root, post, header, captionBox;
    final TextView avatar, name, date, caption, likes, comments, preview, addComment, readMore;
    final ImageView photo, quoteBackdrop;
    final TextView quote;
    final Icon like, bookmark;
    String source = "";
    String backdropSource = "";
    Post item;
    boolean expanded;

    Holder(boolean isPhoto) {
      root = u.column();
      root.setPadding(u.dp(14), u.dp(2), u.dp(14), u.dp(14));
      root.setTag(this);
      post = u.column();
      GradientDrawable surface = u.shape(Color.WHITE, 24);
      surface.setStroke(u.dp(1), 0xffdce4fb);
      post.setBackground(surface);
      post.setPadding(u.dp(1), u.dp(1), u.dp(1), u.dp(1));
      post.setClipToOutline(true);
      post.setElevation(u.dp(2));
      root.addView(post);
      header = u.row(10);
      header.setPadding(u.dp(14), u.dp(8), u.dp(6), u.dp(8));
      avatar = avatar(getContext(), "us", 38);
      header.addView(avatar, new LinearLayout.LayoutParams(u.dp(38), u.dp(38)));
      LinearLayout byline = u.column();
      name = u.text("", 14, Ui.INK);
      Compat.font(name, R.font.dm_sans, 650);
      date = u.text("", 11, Ui.MUTED);
      byline.addView(name);
      byline.addView(date);
      header.addView(byline, new LinearLayout.LayoutParams(0, -2, 1));
      Icon more = new Icon(getContext(), "more");
      more.setContentDescription("Post options");
      more.setOnClickListener(v -> host.more(item, more));
      header.addView(more, new LinearLayout.LayoutParams(u.dp(48), u.dp(48)));
      post.addView(header);
      photo = new Motion.LivingImage(getContext());
      photo.setScaleType(ImageView.ScaleType.FIT_CENTER);
      photo.setBackgroundColor(Ui.BLUE);
      photo.setAdjustViewBounds(true);
      quote = u.quote("", 25);
      quote.setGravity(Gravity.CENTER);
      quote.setLineSpacing(u.dp(7), 1);
      quote.setPadding(u.dp(24), u.dp(24), u.dp(24), u.dp(24));
      quoteBackdrop = Images.backdrop(getContext());
      quoteBackdrop.setScaleType(ImageView.ScaleType.CENTER_CROP);
      quoteBackdrop.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
      FrameLayout mediaFrame = new FrameLayout(getContext());
      mediaFrame.setBackground(u.shape(Ui.BLUE, 18));
      mediaFrame.setClipToOutline(true);
      if (isPhoto) mediaFrame.addView(photo, new FrameLayout.LayoutParams(-1, -2));
      else {
        mediaFrame.addView(quoteBackdrop, new FrameLayout.LayoutParams(-1, -1));
        mediaFrame.addView(quote, new FrameLayout.LayoutParams(-1, -2));
      }
      LinearLayout.LayoutParams mediaParams = new LinearLayout.LayoutParams(-1, -2);
      mediaParams.setMargins(u.dp(10), 0, u.dp(10), 0);
      post.addView(mediaFrame, mediaParams);
      LinearLayout keepsake = u.row(0);
      keepsake.setGravity(Gravity.CENTER);
      keepsake.setPadding(0, u.dp(7), 0, u.dp(7));
      TextView badge = u.text("♡  Kept close", 11, Ui.PURPLE);
      badge.setPadding(u.dp(12), u.dp(4), u.dp(12), u.dp(4));
      badge.setBackground(u.shape(Ui.PALE, 18));
      keepsake.addView(badge);
      keepsake.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
      post.addView(keepsake);
      View rule = new View(getContext());
      rule.setBackgroundColor(0xffececf7);
      LinearLayout.LayoutParams ruleParams = new LinearLayout.LayoutParams(-1, u.dp(1));
      ruleParams.setMargins(u.dp(14), 0, u.dp(14), 0);
      post.addView(rule, ruleParams);
      GestureDetector taps =
          new GestureDetector(
              getContext(),
              new GestureDetector.SimpleOnGestureListener() {
                public boolean onDown(MotionEvent e) {
                  return true;
                }

                public boolean onSingleTapConfirmed(MotionEvent e) {
                  if (isPhoto) host.explore(item);
                  else {
                    expanded = !expanded;
                    showQuote();
                  }
                  return true;
                }

                public boolean onDoubleTap(MotionEvent e) {
                  View anchor = isPhoto ? photo : quote;
                  Motion.hearts(anchor);
                  Motion.haptic(anchor, true);
                  if (!item.liked(host.actor())) host.react(item, true, anchor);
                  return true;
                }
              });
      View media = isPhoto ? photo : quote;
      media.setContentDescription(
          isPhoto
              ? "Post photo. Double tap to like, tap to explore."
              : "Quote. Double tap to like, tap to expand.");
      media.setOnTouchListener((view, event) -> taps.onTouchEvent(event));
      media.setOnClickListener(
          view -> {
            if (isPhoto) host.explore(item);
            else {
              expanded = !expanded;
              showQuote();
            }
          });
      Motion.customTouch(media);
      LinearLayout actions = u.row(0);
      actions.setPadding(u.dp(8), u.dp(5), u.dp(8), 0);
      like = new Icon(getContext(), "heart");
      like.setOnClickListener(v -> host.react(item, !item.liked(host.actor()), like));
      Icon comment = new Icon(getContext(), "comment");
      comment.setContentDescription("Comment on post");
      comment.setOnClickListener(v -> host.comments(item));
      Icon share = new Icon(getContext(), "send");
      share.setContentDescription("Share post");
      share.setOnClickListener(v -> share(item));
      actions.addView(like, new LinearLayout.LayoutParams(u.dp(48), u.dp(48)));
      actions.addView(comment, new LinearLayout.LayoutParams(u.dp(48), u.dp(48)));
      actions.addView(share, new LinearLayout.LayoutParams(u.dp(48), u.dp(48)));
      actions.addView(new View(getContext()), new LinearLayout.LayoutParams(0, 1, 1));
      bookmark = new Icon(getContext(), "bookmark");
      bookmark.setOnClickListener(v -> host.savePost(item));
      actions.addView(bookmark, new LinearLayout.LayoutParams(u.dp(48), u.dp(48)));
      post.addView(actions);
      captionBox = u.column();
      captionBox.setPadding(u.dp(18), 0, u.dp(18), u.dp(16));
      post.addView(captionBox);
      likes = u.text("", 13, Ui.INK);
      Compat.font(likes, R.font.dm_sans, 650);
      u.add(captionBox, likes, 0);
      caption = u.text("", 14, Ui.INK);
      caption.setMaxLines(4);
      caption.setEllipsize(android.text.TextUtils.TruncateAt.END);
      caption.setOnClickListener(
          v -> {
            caption.setMaxLines(caption.getMaxLines() == 4 ? Integer.MAX_VALUE : 4);
            Motion.layout(post);
          });
      u.add(captionBox, caption, 7);
      readMore = u.text("Read the whole quote", 12, Ui.PURPLE);
      readMore.setMinHeight(u.dp(40));
      readMore.setGravity(Gravity.CENTER_VERTICAL);
      readMore.setOnClickListener(
          v -> {
            expanded = !expanded;
            showQuote();
            Motion.layout(post);
          });
      u.add(captionBox, readMore, 0);
      comments = u.text("", 13, Ui.MUTED);
      comments.setMinHeight(u.dp(36));
      comments.setGravity(Gravity.CENTER_VERTICAL);
      comments.setOnClickListener(v -> host.comments(item));
      u.add(captionBox, comments, 1);
      preview = u.text("", 13, Ui.INK);
      preview.setMaxLines(2);
      preview.setEllipsize(android.text.TextUtils.TruncateAt.END);
      preview.setOnClickListener(v -> host.comments(item));
      u.add(captionBox, preview, 1);
      LinearLayout input = u.row(8);
      input.setPadding(u.dp(10), 0, u.dp(10), 0);
      input.setBackground(u.shape(Ui.BG, 22));
      TextView self = avatar(getContext(), host.actor(), 25);
      input.addView(self, new LinearLayout.LayoutParams(u.dp(25), u.dp(25)));
      addComment = u.text("Leave a little love…", 13, Ui.MUTED);
      addComment.setMinHeight(u.dp(44));
      addComment.setGravity(Gravity.CENTER_VERTICAL);
      input.addView(addComment, new LinearLayout.LayoutParams(0, -2, 1));
      input.setOnClickListener(v -> host.comments(item));
      u.add(captionBox, input, 4);
      Motion.install(root);
    }

    void bind(Post next) {
      if (item == null || !item.key().equals(next.key())) {
        expanded = false;
        caption.setMaxLines(4);
      }
      item = next;
      name.setText(next.name());
      setAvatar(avatar, next.author());
      String when = next.value.optString("date");
      try {
        when = Dates.display(when);
      } catch (Exception ignored) {
      }
      date.setText(
          (next.kind.equals("photo") ? "A moment" : "A thought")
              + (when.isEmpty() ? "" : " · " + when)
              + (next.value.optBoolean("pending") ? " · saved offline" : ""));
      if (next.kind.equals("photo")) {
        if (!source.equals(next.source())) {
          source = next.source();
          host.feedImages().load(source, photo);
        }
        photo.setContentDescription(
            next.value.optString("alt", next.value.optString("caption", "A picture of us"))
                + ". Tap to explore. Double tap to like.");
      } else {
        String background = QuoteBackgrounds.source(next.backgroundIndex);
        if (!background.equals(backdropSource)) {
          backdropSource = background;
          host.feedImages().load(background, quoteBackdrop);
        }
        showQuote();
      }
      like.on = next.liked(host.actor());
      like.invalidate();
      like.setContentDescription(like.on ? "Unlike post" : "Like post");
      bookmark.on = host.saved(next);
      bookmark.invalidate();
      bookmark.setContentDescription(bookmark.on ? "Unsave post" : "Save post");
      boolean asnat = next.liked("asnat"), youssef = next.liked("youssef");
      likes.setText(
          asnat && youssef
              ? "Liked by you both ♡"
              : asnat
                  ? "Liked by Asnat ♡"
                  : youssef ? "Liked by Youssef ♡" : "A little love goes a long way");
      String text = next.value.optString(next.kind.equals("photo") ? "caption" : "note");
      caption.setVisibility(text.isEmpty() ? GONE : VISIBLE);
      caption.setText(text);
      int count = next.comments().length();
      comments.setText(
          count == 0
              ? "Start our conversation"
              : "View " + (count == 1 ? "1 comment" : "all " + count + " comments"));
      preview.setVisibility(count == 0 ? GONE : VISIBLE);
      if (count > 0) {
        JSONObject last = next.comments().optJSONObject(count - 1);
        if (last != null)
          preview.setText(nameOf(last.optString("author")) + "  " + last.optString("text"));
      }
      readMore.setVisibility(
          next.kind.equals("quote") && next.value.optString("text").length() > 260
              ? VISIBLE
              : GONE);
      readMore.setText(expanded ? "Keep it little" : "Read the whole quote");
    }

    void showQuote() {
      if (item == null) return;
      quote.setText("“" + item.value.optString("text") + "”");
      quote.setTextSize(item.value.optString("text").length() > 300 ? 20 : 24);
      quote.setMaxLines(expanded ? Integer.MAX_VALUE : 9);
      quote.setEllipsize(expanded ? null : android.text.TextUtils.TruncateAt.END);
      readMore.setText(expanded ? "Keep it little" : "Read the whole quote");
    }
  }

  private void share(Post post) {
    String text = post.value.optString(post.kind.equals("photo") ? "caption" : "text");
    Intent intent =
        new Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, text + "\n\nOur little universe ♡\n" + ApiClient.SITE);
    getContext().startActivity(Intent.createChooser(intent, "Share this little moment"));
  }

  static TextView avatar(Context context, String actor, int size) {
    Ui ui = new Ui(context);
    TextView avatar = ui.text("", size > 40 ? 20 : 14, Ui.PRIMARY);
    avatar.setGravity(Gravity.CENTER);
    Compat.font(avatar, R.font.dm_sans, 650);
    setAvatar(avatar, actor);
    return avatar;
  }

  static void setAvatar(TextView view, String actor) {
    GradientDrawable circle =
        new GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            actor.equals("youssef")
                ? new int[] {0xffdceafa, 0xffeeeafa}
                : new int[] {0xffe6ddf7, 0xfff4eaf5});
    circle.setShape(GradientDrawable.OVAL);
    view.setBackground(circle);
    view.setText(actor.equals("asnat") ? "A" : actor.equals("youssef") ? "Y" : "♡");
  }

  static final class Icon extends View {
    final String kind;
    boolean on;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

    Icon(Context context, String kind) {
      super(context);
      this.kind = kind;
      setClickable(true);
      setFocusable(true);
      setMinimumWidth(new Ui(context).dp(48));
      setMinimumHeight(new Ui(context).dp(48));
      setBackground(
          new RippleDrawable(
              android.content.res.ColorStateList.valueOf(0x226b5cb5),
              null,
              new Ui(context).shape(Color.WHITE, 30)));
    }

    protected void onDraw(Canvas canvas) {
      super.onDraw(canvas);
      int save = canvas.save();
      float size = Math.min(getWidth(), getHeight()) * .52f;
      canvas.translate((getWidth() - size) / 2, (getHeight() - size) / 2);
      canvas.scale(size / 24, size / 24);
      paint.setColor(on ? Ui.PURPLE : Ui.INK);
      paint.setStrokeWidth(1.75f);
      paint.setStrokeCap(Paint.Cap.ROUND);
      paint.setStrokeJoin(Paint.Join.ROUND);
      paint.setStyle(Paint.Style.STROKE);
      Path path = new Path();
      switch (kind) {
        case "heart":
          path.moveTo(12, 21);
          path.cubicTo(9, 18, 2, 13, 2, 7.5f);
          path.cubicTo(2, 1, 9, 1, 12, 6);
          path.cubicTo(15, 1, 22, 1, 22, 7.5f);
          path.cubicTo(22, 13, 15, 18, 12, 21);
          path.close();
          if (on) paint.setStyle(Paint.Style.FILL_AND_STROKE);
          canvas.drawPath(path, paint);
          break;
        case "comment":
          path.moveTo(5, 19);
          path.lineTo(2, 22);
          path.lineTo(3, 15);
          path.cubicTo(-2, 4, 8, -1, 16, 3);
          path.cubicTo(27, 9, 19, 23, 5, 19);
          canvas.drawPath(path, paint);
          break;
        case "bookmark":
          path.moveTo(5, 2);
          path.lineTo(19, 2);
          path.lineTo(19, 22);
          path.lineTo(12, 17);
          path.lineTo(5, 22);
          path.close();
          if (on) paint.setStyle(Paint.Style.FILL_AND_STROKE);
          canvas.drawPath(path, paint);
          break;
        case "send":
          path.moveTo(2, 10);
          path.lineTo(22, 2);
          path.lineTo(15, 22);
          path.lineTo(11, 13);
          path.close();
          canvas.drawPath(path, paint);
          canvas.drawLine(11, 13, 22, 2, paint);
          break;
        case "plus":
          canvas.drawRoundRect(2, 2, 22, 22, 6, 6, paint);
          canvas.drawLine(12, 7, 12, 17, paint);
          canvas.drawLine(7, 12, 17, 12, paint);
          break;
        case "close":
          canvas.drawLine(5, 5, 19, 19, paint);
          canvas.drawLine(19, 5, 5, 19, paint);
          break;
        case "more":
          paint.setStyle(Paint.Style.FILL);
          for (int x = 4; x <= 20; x += 8) canvas.drawCircle(x, 12, 1.7f, paint);
          break;
        case "camera":
          canvas.drawRoundRect(2, 5, 22, 21, 4, 4, paint);
          canvas.drawCircle(12, 13, 4, paint);
          canvas.drawLine(8, 2, 16, 2, paint);
          break;
        case "quote":
          canvas.drawRoundRect(3, 5, 10, 13, 2, 2, paint);
          canvas.drawRoundRect(14, 5, 21, 13, 2, 2, paint);
          path.moveTo(10, 12);
          path.quadTo(10, 19, 5, 20);
          path.moveTo(21, 12);
          path.quadTo(21, 19, 16, 20);
          canvas.drawPath(path, paint);
          break;
      }
      canvas.restoreToCount(save);
    }
  }
}
