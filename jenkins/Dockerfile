FROM jenkins/jenkins:lts-jdk21

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs npm curl ca-certificates python3 python3-pip python3-venv \
    && curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-28.5.1.tgz -o /tmp/docker.tgz \
    && tar -xzf /tmp/docker.tgz -C /tmp \
    && install -m 0755 /tmp/docker/docker /usr/local/bin/docker \
    && python3 -m venv /opt/ansible-venv \
    && /opt/ansible-venv/bin/pip install --no-cache-dir ansible \
    && rm -rf /tmp/docker /tmp/docker.tgz \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/opt/ansible-venv/bin:${PATH}"

USER root
