FROM ghcr.io/ggml-org/llama.cpp:server
EXPOSE 8080
CMD ["-hf","ggml-org/DeepSeek-R1-Distill-Qwen-1.5B-Q4_0-GGUF:Q4_0","--alias","deepseek-critic-local","--host","0.0.0.0","--port","8080","--ctx-size","4096","--threads","4","--jinja","--reasoning","off","--reasoning-format","none"]
