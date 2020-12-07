'use strict';
const k8s = require('@kubernetes/client-node');

const kc = new k8s.KubeConfig();
kc.loadFromCluster();
const k8Core = kc.makeApiClient(k8s.CoreV1Api);
let change = 0;
let startTime;

const log = msg => console.log(`${(new Date() - startTime) / 1000.0} ${msg}`);

const doWatch = async () => {
  let listMetadata = undefined;
  let pod = '';
  do {
    log('Listing pods...');
    const {
      body: { items: [{ metadata: { name: podA } }], metadata }
    } = await k8Core.listNamespacedPod(
      'default', false, false,
      listMetadata && listMetadata._continue,
      undefined,
      'app=watch',
      100
    );
    pod = podA;
    listMetadata = metadata;
  } while (listMetadata._continue);
  const { resourceVersion, selfLink } = listMetadata;
  
  let timeout = null;
  log('Starting watch.');
  const watchRequest = await new k8s.Watch(kc).watch(
    selfLink,
    {
      resourceVersion,
      timeoutSeconds: 6 * 60 // 6  minutes
    },
    () => { },
    e => {
      log(`Watch Shutdown ${e ? e : ''}`);
      clearTimeout(timeout);
      doWatch();
    }
  );
  timeout = setTimeout(() => {
    log('!!! Manually aborting watch !!!!!');
    watchRequest.abort();
    doWatch();
  }, 8 * 60 * 1000); // if we get to 8 minutes we need to kill it and restart something didn't close correctly

  setTimeout(async () => {
    log(`Patching ${pod}`);
    await k8Core.patchNamespacedPod(pod, 'default',
      [
        {
          op   : 'replace',
          path : '/metadata/labels/change',
          value: (change += 1).toString()
        }
      ],
      undefined, undefined, undefined, undefined,
      { headers: { 'Content-Type': 'application/json-patch+json' } }
    );
  }, 2 * 1000); // 2 seconds
};

const delay = t => new Promise(resolve => setTimeout(resolve, t));
const start = async () => {
  await delay(1000);
  startTime = new Date();
  await doWatch();
};
start();
