FROM ghcr.io/ggml-org/llama.cpp:server
EXPOSE 8080
CMD ["-hf","bartowski/google_gemma-3-1b-it-GGUF:Q4_K_M","--alias","gemma-critic-local","--host","0.0.0.0","--port","8080","--ctx-size","8192","--parallel","1","--threads","4","--jinja"]
