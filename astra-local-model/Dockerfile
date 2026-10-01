FROM ghcr.io/ggml-org/llama.cpp:server
EXPOSE 8080
CMD ["-hf","Qwen/Qwen2.5-Coder-3B-Instruct-GGUF:Q4_K_M","--alias","qwen-coder-local","--host","0.0.0.0","--port","8080","--ctx-size","4096","--parallel","1","--threads","8","--threads-batch","8","--cache-type-k","q8_0","--cache-type-v","q8_0","--cache-ram","256","--jinja"]
