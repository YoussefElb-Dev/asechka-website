package app.asechka.android;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.security.*;

/** Small, bounded RFC6455 codec; deliberately has no Android or external dependencies. */
final class GamesWire {
  static final int LIMIT = 8 * 1024 * 1024;
  private static final SecureRandom RANDOM = new SecureRandom();

  static String accept(String key) throws Exception {
    return base64(MessageDigest.getInstance("SHA-1")
        .digest((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").getBytes(StandardCharsets.US_ASCII)));
  }

  static String nonce() {
    byte[] value = new byte[16];
    RANDOM.nextBytes(value);
    return base64(value);
  }

  static String base64(byte[] bytes) {
    final String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    StringBuilder result = new StringBuilder((bytes.length + 2) / 3 * 4);
    for (int i = 0; i < bytes.length; i += 3) {
      int a = bytes[i] & 255, b = i + 1 < bytes.length ? bytes[i + 1] & 255 : 0;
      int c = i + 2 < bytes.length ? bytes[i + 2] & 255 : 0;
      result.append(alphabet.charAt(a >>> 2));
      result.append(alphabet.charAt(((a & 3) << 4) | (b >>> 4)));
      result.append(i + 1 < bytes.length ? alphabet.charAt(((b & 15) << 2) | (c >>> 6)) : '=');
      result.append(i + 2 < bytes.length ? alphabet.charAt(c & 63) : '=');
    }
    return result.toString();
  }

  static final class Frame {
    final int opcode;
    final boolean fin;
    final byte[] bytes;
    Frame(int opcode, boolean fin, byte[] bytes) {
      this.opcode = opcode; this.fin = fin; this.bytes = bytes;
    }
  }

  static Frame read(InputStream in) throws IOException {
    int first = octet(in), second = octet(in);
    if ((first & 112) != 0 || (second & 128) != 0) throw new IOException("Invalid WebSocket frame");
    int opcode = first & 15;
    if (opcode != 0 && opcode != 1 && opcode != 8 && opcode != 9 && opcode != 10)
      throw new IOException("Unsupported WebSocket frame");
    long size = second & 127;
    if (size == 126) size = (octet(in) << 8) | octet(in);
    else if (size == 127) {
      size = 0;
      for (int i = 0; i < 8; i++) {
        int b = octet(in);
        if (i == 0 && (b & 128) != 0) throw new IOException("Invalid frame size");
        size = (size << 8) | b;
      }
    }
    boolean fin = (first & 128) != 0;
    if (size > LIMIT || size < 0 || (opcode >= 8 && (!fin || size > 125)))
      throw new IOException("WebSocket frame too large");
    byte[] data = new byte[(int) size];
    int offset = 0;
    while (offset < data.length) {
      int count = in.read(data, offset, data.length - offset);
      if (count < 0) throw new EOFException("Connection ended during frame");
      offset += count;
    }
    if (opcode == 8 && data.length == 1) throw new IOException("Invalid close frame");
    return new Frame(opcode, fin, data);
  }

  static void write(OutputStream out, int opcode, byte[] bytes) throws IOException {
    if (bytes.length > LIMIT || (opcode >= 8 && bytes.length > 125)) throw new IOException("Message too large");
    out.write(128 | opcode);
    int size = bytes.length;
    if (size < 126) out.write(128 | size);
    else if (size <= 65535) { out.write(254); out.write(size >>> 8); out.write(size); }
    else {
      out.write(255);
      for (int i = 7; i >= 0; i--) out.write((int) (((long) size) >>> (8 * i)));
    }
    byte[] mask = new byte[4]; RANDOM.nextBytes(mask); out.write(mask);
    for (int i = 0; i < size; i++) out.write(bytes[i] ^ mask[i & 3]);
    out.flush();
  }

  static String utf8(byte[] bytes) throws IOException {
    try {
      return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
          .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
    } catch (CharacterCodingException error) { throw new IOException("Invalid UTF-8 message", error); }
  }

  static String header(InputStream in) throws IOException {
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    int tail = 0;
    while (bytes.size() < 16384) {
      int b = octet(in); bytes.write(b); tail = (tail << 8) | b;
      if (tail == 0x0d0a0d0a) return new String(bytes.toByteArray(), StandardCharsets.US_ASCII);
    }
    throw new IOException("WebSocket handshake too large");
  }

  private static int octet(InputStream in) throws IOException {
    int value = in.read();
    if (value < 0) throw new EOFException("Game connection closed");
    return value;
  }
}
