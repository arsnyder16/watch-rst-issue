FROM buildpack-deps:bionic-curl

RUN set -ex \ 
    && apt-get update \
    && curl -sL https://deb.nodesource.com/setup_10.x | bash - \
    && apt-get install --no-install-recommends -y \        
        nodejs \
        git \
    && rm -rf /var/lib/apt/lists/*

COPY . .
ENTRYPOINT [ "node", "controller.js"]