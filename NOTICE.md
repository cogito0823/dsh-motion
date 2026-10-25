# Third-party notices

本包不包含以下项目的源码，但会调用或与其配合；分发或商用前请自行遵守各自许可。

| 项目 | 许可 | 关系 |
|---|---|---|
| [HyperFrames](https://github.com/heygen-com/hyperframes) | Apache-2.0 | 交付管线（组装 / 字幕 / 编码）；通过 `npx hyperframes` 调用，不打包 |
| [Manim Community](https://github.com/ManimCommunity/manim) | MIT | 可选渲染后端 |
| [manimgx](https://github.com/academa-labs/manimgx) | MIT | 默认渲染后端 |
| [SymPy](https://github.com/sympy/sympy) | BSD-3-Clause | `formula_check` |
| [Lemo-Opuscar](https://github.com/lemomo-ai/lemo-opuscar) | MIT（风格文档/代码）· CC BY 4.0（demo 静帧） | `swiss-motion` / `dataviz` / `blueprint` / `whiteboard` 的改编来源；只取语法与规范，不打包 demo 代码 |
| [subinium/3b1b-style-animation-skill](https://github.com/subinium/3b1b-style-animation-skill) | MIT | `3b1b` 的配色与教学法来源；非 3Blue1Brown 官方项目 |
| [adithya-s-k/manim_skill](https://github.com/adithya-s-k/manim_skill) | MIT | `3b1b` 的方法论参考（Manim 社区常用 skill） |
| [FFmpeg](https://ffmpeg.org) | LGPL/GPL（取决于构建） | 渲染、后期、抽帧；**不打包**，由用户自行安装 |
| [edge-tts](https://github.com/rany2/edge-tts) | LGPL-3.0 | 免费旁白（词级时间戳）；通过用户自己的 Python 环境调用，**不打包**；它调用微软 Edge 的非官方朗读接口 |
| [Fun-CosyVoice3](https://github.com/FunAudioLLM/CosyVoice) | Apache-2.0 | 推荐的可商用离线中文 TTS 备选；**不打包** |

字体不随包分发；若你的 `DESIGN.md` 指定了第三方字体，请确认其许可（OFL / 商用授权）。

本包自身的代码以 MIT 许可发布（见 `LICENSE`）。
