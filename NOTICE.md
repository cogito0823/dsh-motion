# Third-party notices

本包不包含以下项目的源码，但会调用或与其配合；分发或商用前请自行遵守各自许可。

| 项目 | 许可 | 关系 |
|---|---|---|
| [HyperFrames](https://github.com/heygen-com/hyperframes) | Apache-2.0 | 交付管线（组装 / 字幕 / 编码）；通过 `npx hyperframes` 调用，不打包 |
| [Manim Community](https://github.com/ManimCommunity/manim) | MIT | 可选渲染后端 |
| [manimgx](https://github.com/academa-labs/manimgx) | MIT | 默认渲染后端 |
| [SymPy](https://github.com/sympy/sympy) | BSD-3-Clause | `formula_check` |
| [FFmpeg](https://ffmpeg.org) | LGPL/GPL（取决于构建） | 渲染、后期、抽帧；**不打包**，由用户自行安装 |

字体不随包分发；若你的 `DESIGN.md` 指定了第三方字体，请确认其许可（OFL / 商用授权）。

本包自身的代码以 MIT 许可发布（见 `LICENSE`）。
