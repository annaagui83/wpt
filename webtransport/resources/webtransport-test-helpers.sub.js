// The file including this must also include /common/get-host-info.sub.js to
// pick up the necessary constants.

const HOST = get_host_info().ORIGINAL_HOST;
const PORT = '{{ports[webtransport-h3][0]}}';
const BASE = `https://${HOST}:${PORT}`;

function wait(ms) { return new Promise(res => step_timeout(res, ms)); }

// Create URL for WebTransport session.
function webtransport_url(handler) {
  return `${BASE}/webtransport/handlers/${handler}`;
}

// Read all chunks from |readable_stream|, decode chunks to a utf-8 string, then
// return the string.
async function read_stream_as_string(readable_stream) {
  const decoder = new TextDecoderStream();
  const decode_stream = readable_stream.pipeThrough(decoder);
  const reader = decode_stream.getReader();

  let chunks = '';
  while (true) {
    const {value: chunk, done} = await reader.read();
    if (done) {
      break;
    }
    chunks += chunk;
  }
  reader.releaseLock();

  return chunks;
}

// Decode all chunks in a given ReadableStream, and parse the data using JSON.
async function read_stream_as_json(readable_stream) {
  const text = await read_stream_as_string(readable_stream);
  return JSON.parse(text);
}

// Check the standard request headers and delete them, leaving any "unique"
// headers to check in the test.
function check_and_remove_standard_headers(headers) {
  assert_equals(headers[':scheme'], 'https');
  delete headers[':scheme'];
  assert_equals(headers[':method'], 'CONNECT');
  delete headers[':method'];
  assert_equals(headers[':authority'], `${HOST}:${PORT}`);
  delete headers[':authority'];
  assert_equals(headers[':path'], '/webtransport/handlers/echo-request-headers.py');
  delete headers[':path'];
  assert_equals(headers[':protocol'], 'webtransport');
  delete headers[':protocol'];
  assert_equals(headers['origin'], `${get_host_info().ORIGIN}`);
  delete headers['origin'];
  assert_equals(headers['datagram-flow-id'], '0');
  delete headers['datagram-flow-id'];
}

// Write datagrams until the producer receives the AbortSignal.
async function write_datagrams(writer, signal) {
  const encoder = new TextEncoder();
  let counter = 0;
  const sentTokens = [];
  while (true) {
    await writer.ready;
    var token = counter.toString();
    sentTokens.push(token);
    writer.write(encoder.encode(token));
    counter++;
    if (signal.aborted) {
      break;
    }
  }
  return sentTokens;
}

// Read datagrams until the consumer has received enough i.e. N datagrams.
async function read_datagrams(reader, controller, N) {
  const decoder = new TextDecoder();
  const receivedTokens = [];
  while (receivedTokens.length < N) {
    const { value: token, done } = await reader.read();
    assert_equals(done, false);
    receivedTokens.push(decoder.decode(token));
  }
  controller.abort();
  return receivedTokens;
}

