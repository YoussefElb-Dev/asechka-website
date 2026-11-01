package app.asechka.android;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.net.ssl.*;

/** TLS with normal certificate/hostname checks. Never sends the site cookie to the game host. */
final class GamesSocket implements Closeable {
  private final SSLSocketFactory tlsFactory;
  private volatile Socket socket;
  private volatile OutputStream output;
  private volatile boolean closed;
  interface Listener { void message(String value) throws Exception; }
  GamesSocket() { this((SSLSocketFactory) SSLSocketFactory.getDefault()); }
  // Package-scoped injection permits an instrumentation fixture with its own trusted CA.
  // Hostname verification is still enforced, including for that fixture.
  GamesSocket(SSLSocketFactory tlsFactory) { this.tlsFactory = tlsFactory; }

  void connect(String address) throws Exception {
    URI uri = new URI(address);
    if (!"wss".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
        || uri.getUserInfo() != null || uri.getFragment() != null)
      throw new IOException("Games requires a secure wss:// service URL.");
    int port = uri.getPort() < 0 ? 443 : uri.getPort();
    Socket tcp = new Socket(); socket = tcp;
    if (closed) { tcp.close(); throw new IOException("Connection cancelled"); }
    tcp.connect(new InetSocketAddress(uri.getHost(), port), 15000);
    SSLSocket tls = (SSLSocket) tlsFactory
        .createSocket(tcp, uri.getHost(), port, true);
    socket = tls;
    if (closed) { tls.close(); throw new IOException("Connection cancelled"); }
    SSLParameters parameters = tls.getSSLParameters();
    boolean endpointChecked = false;
    try {
      // Android 6 has no endpoint-identification setter; verify its session below.
      SSLParameters.class.getMethod("setEndpointIdentificationAlgorithm", String.class)
          .invoke(parameters, "HTTPS");
      tls.setSSLParameters(parameters); endpointChecked = true;
    } catch (NoSuchMethodException ignored) { }
    tls.setSoTimeout(45000);
    tls.startHandshake();
    if (!endpointChecked && !HttpsURLConnection.getDefaultHostnameVerifier().verify(uri.getHost(), tls.getSession()))
      throw new SSLHandshakeException("The game service certificate does not match its hostname.");
    String key = GamesWire.nonce();
    String path = uri.getRawPath();
    if (path == null || path.isEmpty()) path = "/";
    if (uri.getRawQuery() != null) path += "?" + uri.getRawQuery();
    String host = uri.getHost() + (port == 443 ? "" : ":" + port);
    OutputStream out = new BufferedOutputStream(tls.getOutputStream());
    out.write(("GET " + path + " HTTP/1.1\r\nHost: " + host
        + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13"
        + "\r\nSec-WebSocket-Key: " + key + "\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
    out.flush();
    String[] lines = GamesWire.header(tls.getInputStream()).split("\r\n");
    if (!lines[0].matches("HTTP/1\\.[01] 101(?: .*|)"))
      throw new IOException("Game service declined the connection. Try reconnecting.");
    Map<String, String> headers = new HashMap<>();
    for (int i = 1; i < lines.length; i++) {
      int colon = lines[i].indexOf(':');
      if (colon > 0) headers.put(lines[i].substring(0, colon).toLowerCase(Locale.US), lines[i].substring(colon + 1).trim());
    }
    if (!GamesWire.accept(key).equals(headers.get("sec-websocket-accept"))
        || !"websocket".equalsIgnoreCase(headers.get("upgrade"))
        || !Arrays.asList((headers.containsKey("connection") ? headers.get("connection") : "").toLowerCase(Locale.US).split("\\s*,\\s*")).contains("upgrade"))
      throw new IOException("Invalid game service handshake");
    output = out;
  }

  void read(Listener listener) throws Exception {
    InputStream in = new BufferedInputStream(socket.getInputStream());
    ByteArrayOutputStream fragments = null;
    while (!closed) {
      GamesWire.Frame frame = GamesWire.read(in);
      if (frame.opcode == 8) { sendFrame(8, frame.bytes); throw new EOFException("Game service closed the connection"); }
      if (frame.opcode == 9) { sendFrame(10, frame.bytes); continue; }
      if (frame.opcode == 10) continue;
      if (frame.opcode == 1) {
        if (fragments != null) throw new IOException("Invalid message fragmentation");
        if (frame.fin) { listener.message(GamesWire.utf8(frame.bytes)); continue; }
        fragments = new ByteArrayOutputStream();
      } else if (fragments == null) throw new IOException("Unexpected continuation frame");
      if (fragments.size() + frame.bytes.length > GamesWire.LIMIT) throw new IOException("Message too large");
      fragments.write(frame.bytes);
      if (frame.fin) { listener.message(GamesWire.utf8(fragments.toByteArray())); fragments = null; }
    }
  }

  void send(String message) throws IOException { sendFrame(1, message.getBytes(StandardCharsets.UTF_8)); }
  private synchronized void sendFrame(int opcode, byte[] bytes) throws IOException {
    if (closed || output == null) throw new IOException("Waiting for game connection");
    GamesWire.write(output, opcode, bytes);
  }
  public void close() {
    closed = true;
    try { if (socket != null) socket.close(); } catch (IOException ignored) { }
    output = null;
  }
}
