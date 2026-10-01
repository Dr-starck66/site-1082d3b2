FROM ghcr.io/ggml-org/llama.cpp:server
EXPOSE 8080
CMD ["-hf","Qwen/Qwen2.5-1.5B-Instruct-GGUF:Q4_K_M","--alias","qwen-chat-local","--host","0.0.0.0","--port","8080","--ctx-size","4096","--parallel","1","--threads","6","--jinja"]
