// META: global=window,worker
// META: script=/common/get-host-info.sub.js
// META: script=resources/webtransport-test-helpers.sub.js

promise_test(async t => {
  // Establish a WebTransport session.
  const wt = new WebTransport(webtransport_url('echo.py'));
  await wt.ready;

  const writer = wt.datagrams.writable.getWriter();
  const reader = wt.datagrams.readable.getReader();

  // Declare an AbortController and AbortSignal to ensure that datagrams are
  // written as long as we read enough data.
  const controller = new AbortController();
  const signal = controller.signal;

  // Write and read datagrams.
  const N = 5;
  const [sentTokens, receivedTokens] = await Promise.all([
      write_datagrams(writer, signal),
      read_datagrams(reader, controller, N)
  ]);

  // Check receivedTokens is a subset of sentTokens.
  const subset = receivedTokens.every(token => sentTokens.includes(token));
  assert_equals(subset, true);
}, 'Datagrams are echoed successfully');

promise_test(async t => {
  // Make a WebTransport connection, but session is not necessarily established.
  const wt = new WebTransport(webtransport_url('echo.py'));

  const writer = wt.datagrams.writable.getWriter();
  const reader = wt.datagrams.readable.getReader();

  // Declare an AbortController and AbortSignal to ensure that datagrams are
  // written as long as we read the data.
  const controller = new AbortController();
  const signal = controller.signal;

  // Write and read datagrams.
  const N = 1;
  const [sentTokens, receivedTokens] = await Promise.all([
      write_datagrams(writer, signal),
      read_datagrams(reader, controller, N)
  ]);

  // Check receivedTokens is a subset of sentTokens.
  const subset = receivedTokens.every(token => sentTokens.includes(token));
  assert_equals(subset, true);

  // Make sure WebTransport session is established.
  await wt.ready;
}, 'Sending and receiving datagrams is ready to use before session is established');

promise_test(async t => {
  // Establish a WebTransport session.
  const wt = new WebTransport(webtransport_url('echo.py'));
  await wt.ready;

  const N = 5;
  wt.datagrams.outgoingHighWaterMark = N;

  const writer = wt.datagrams.writable.getWriter();
  const encoder = new TextEncoder();

  // Write N-1 datagrams.
  let counter;
  for (counter = 0; counter < N-1; counter++) {
    var datagram = counter.toString();
    let resolved = false;
    writer.write(encoder.encode(datagram));

    // Check writer.ready resolves immediately.
    writer.ready.then(() => resolved = true);
    // TODO(nidhijaju): The number of `await Promise.resolve()` calls is
    // implementation dependent, so we should not have this as the final
    // solution.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    assert_true(resolved);
  }

  // Write one more datagram.
  resolved = false;
  const last_datagram = counter.toString();
  writer.write(encoder.encode(last_datagram));

  // Check writer.ready does not resolve immediately.
  writer.ready.then(() => resolved = true);
  assert_false(resolved);

  // Make sure writer.ready is resolved eventually.
  await writer.ready;
}, 'Datagram\'s outgoingHighWaterMark correctly regulates written datagrams');

promise_test(async t => {
  // Establish a WebTransport session.
  const wt = new WebTransport(webtransport_url('echo.py'));
  await wt.ready;

  const N = 5;
  wt.datagrams.incomingHighWaterMark = N;

  const writer = wt.datagrams.writable.getWriter();
  const encoder = new TextEncoder();

  // Write 10*N datagrams.
  let counter;
  for (counter = 0; counter < 10*N; counter++) {
    var datagram = counter.toString();
    writer.write(encoder.encode(datagram));
    await writer.ready;
  }

  // Wait for 500ms.
  wait(500);

  const reader = wt.datagrams.readable.getReader();

  // Read all of the immediately available datagrams.
  let receivedDatagrams = 0;
  while (true) {
    let resolved = false;
    reader.read().then(() => resolved = true);
    // TODO(nidhijaju): Find a better solution instead of just having numerous
    // `await Promise.resolve()` calls.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    if (!resolved) {
      break;
    }
    receivedDatagrams++;
  }

  // Check that the receivedDatagrams is less than or equal to the
  // incomingHighWaterMark.
  assert_less_than_equal(receivedDatagrams, N);
}, 'Datagrams read is less than or equal to the incomingHighWaterMark');

