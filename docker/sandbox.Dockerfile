# Paper2Agent experiment sandbox
# Provides an isolated Python environment for running ML experiments
# with optional GPU support and network policy enforcement.

FROM python:3.11-slim

# System dependencies common to most ML experiments
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    curl \
    wget \
    iptables \
    && rm -rf /var/lib/apt/lists/*

# Common Python packages that experiments frequently need
RUN pip install --no-cache-dir \
    numpy \
    scipy \
    pandas \
    scikit-learn \
    matplotlib \
    tqdm \
    pyyaml \
    jsonlines

WORKDIR /workspace

# Entrypoint handles environment activation and network policy
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bash"]
