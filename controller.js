'use strict';
const k8s = require('@kubernetes/client-node');

const kc = new k8s.KubeConfig();
kc.loadFromCluster();
const k8Core = kc.makeApiClient(k8s.CoreV1Api);
k8Core.addInterceptor(options => {
 options.forever = true;
 options.timeout = 10000;
});

class WatchRequest {
  webRequest(options) {
    const {
      ca, headers, method, qs, uri
    } = options;
    const url = new URL(uri);
    const session = http2.connect(url, { ca });
    let ping = null;
    let error = '';
    session.on('error', err => error += err);
    session.on('close', () => clearInterval(ping));
    const stream = session.request({ 
      ...headers,
      ':method': method, 
      ':path'  : `${url.pathname}?${new URLSearchParams(qs)}`,
      'accept' : 'application/json'
    }, { 'endStream': false });
    stream.setEncoding('utf8');
    ping = setInterval(() => {
      session.ping(error => {
        if (error || stream.closed) {
          clearInterval(ping);
          if (!session.destroyed) {
            session.destroy(error || 'stream was closed');
          } else {
            console.log(`session was already destroyed, ${error || 'stream was closed'}`);
          }
        }
      });
    }, 2000);
    stream.on('error', () => {/* no opt this will allow session 'error' to be emitted instead of throwing an exception */});
    stream.on('close', () => {
      clearInterval(ping);
      session.close();
    });
    stream.abort = () => {};
    return stream;
  }
}
let change = 0;
let startTime;

const log = msg => console.log(`${(new Date() - startTime) / 1000.0} ${msg}`);

const doWatch = async () => {
  let listMetadata = undefined;
  log('Listing pods...');
  const {
    body: { items, metadata: { resourceVersion } }
  } = await this.k8Core.listNamespacedPod(
    'default',
    false,
    false,
    undefined,
    undefined,
    'app=mssonline-api',
    undefined,
    undefined,
    undefined,
    30, /* We have seen some very slow listings these are very critical to the workload so anything slower than 30 seconds we gotta restart */ 
  );
  const { resourceVersion, selfLink } = listMetadata;
  log(`Found ${items.length}`);
  let timeout = null;
  log('Starting watch.');
  const watchRequest = await new k8s.Watch(kc, new WatchRequest()).watch(
    selfLink,
    {
      resourceVersion,
      timeoutSeconds: 210 // 3.5  minutes
    },
    (type, { metadata: { name } }) => { log(type, name); },
    e => {
      log(`Watch Shutdown ${e ? e : ''}`);
      clearTimeout(timeout);
      doWatch();
    }
  );
  timeout = setTimeout(() => {
    log('!!! Manually aborting watch !!!!!');
    watchRequest.destroy();
    doWatch();
  }, 211 * 1000); // if we get to 3 minutes 31 seconds we need to kill it and restart something didn't close correctly, thanks azure load balancer
};

const delay = t => new Promise(resolve => setTimeout(resolve, t));
const start = async () => {
  await delay(1000);
  startTime = new Date();
  await doWatch();
};
start();
