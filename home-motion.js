/* 首页渐进增强：仅处理 .zl-home，不参与 MDX 内容解析。 */
(() => {
  if (typeof window.matchMedia !== "function") return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const mounted = new Map();

  function mount(root) {
    const cleanups = [];
    const cleanup = () => {
      cleanups.splice(0).reverse().forEach((fn) => fn());
    };

    try {
      // 只有初始化时仍在首屏下方的内容参与入场，不隐藏已有焦点。
      if (!reduce.matches && "IntersectionObserver" in window) {
        const fold = window.innerHeight || document.documentElement.clientHeight;
        const pending = Array.from(root.querySelectorAll(".zl-reveal")).filter(
          (el) => el.getBoundingClientRect().top > fold && !el.matches(":focus-within")
        );
        const timers = new Set();
        let io;
        const showAll = () => {
          if (io) io.disconnect();
          timers.forEach((timer) => window.clearTimeout(timer));
          timers.clear();
          pending.forEach((el) => {
            el.classList.remove("zl-pending");
            el.style.transitionDelay = "";
          });
        };
        cleanups.push(showAll);

        if (pending.length) {
          io = new IntersectionObserver((entries) => {
            try {
              let step = 0;
              entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                io.unobserve(el);
                el.style.transitionDelay = Math.min(step, 4) * 70 + "ms";
                step += 1;
                el.classList.remove("zl-pending");
                const timer = window.setTimeout(() => {
                  el.style.transitionDelay = "";
                  timers.delete(timer);
                }, 1100);
                timers.add(timer);
              });
            } catch (error) {
              showAll();
            }
          }, { rootMargin: "0px 0px -48px 0px", threshold: 0 });

          pending.forEach((el) => {
            io.observe(el);
            el.classList.add("zl-pending");
          });

          const onFocus = (event) => {
            const el = event.target.closest(".zl-pending");
            if (!el || !root.contains(el)) return;
            io.unobserve(el);
            el.style.transitionDelay = "";
            el.classList.remove("zl-pending");
          };
          const onReduce = () => {
            if (reduce.matches) showAll();
          };
          root.addEventListener("focusin", onFocus);
          cleanups.push(() => root.removeEventListener("focusin", onFocus));
          if (typeof reduce.addEventListener === "function") {
            reduce.addEventListener("change", onReduce);
            cleanups.push(() => reduce.removeEventListener("change", onReduce));
          }
        }
      }

      // 单一视口光晕：使用鼠标的视口坐标，滚动或跨区块时无需重新定位。
      const layer = root.querySelector(".zl-glow");
      if (layer && typeof window.requestAnimationFrame === "function") {
        let frame = 0;
        let x = 0;
        let y = 0;
        const pause = () => {
          if (frame) window.cancelAnimationFrame(frame);
          frame = 0;
          root.classList.remove("zl-glow-active");
        };
        const reset = () => {
          pause();
          layer.style.removeProperty("--zl-x");
          layer.style.removeProperty("--zl-y");
        };
        cleanups.push(reset);

        const onMove = (event) => {
          if (event.pointerType === "touch" || reduce.matches || !fine.matches) {
            reset();
            return;
          }
          x = event.clientX;
          y = event.clientY;
          if (frame) return;
          frame = window.requestAnimationFrame(() => {
            frame = 0;
            if (reduce.matches || !fine.matches || !root.isConnected) {
              reset();
              return;
            }
            layer.style.setProperty("--zl-x", x + "px");
            layer.style.setProperty("--zl-y", y + "px");
            root.classList.add("zl-glow-active");
          });
        };

        // 监听整页，不在 ZWWF Labs、主要项目等区块边界重置光晕。
        document.addEventListener("pointermove", onMove, { passive: true });
        document.documentElement.addEventListener("pointerleave", pause);
        window.addEventListener("blur", pause);
        cleanups.push(() => {
          document.removeEventListener("pointermove", onMove);
          document.documentElement.removeEventListener("pointerleave", pause);
          window.removeEventListener("blur", pause);
        });
        [reduce, fine].forEach((query) => {
          if (typeof query.addEventListener !== "function") return;
          query.addEventListener("change", reset);
          cleanups.push(() => query.removeEventListener("change", reset));
        });
      }
    } catch (error) {
      // 初始化失败时恢复所有内容，不让动效阻断阅读。
      cleanup();
    }
    return cleanup;
  }

  function sync() {
    const roots = new Set(document.querySelectorAll(".zl-home"));
    mounted.forEach((cleanup, root) => {
      if (roots.has(root)) return;
      cleanup();
      mounted.delete(root);
    });
    roots.forEach((root) => {
      if (!mounted.has(root)) mounted.set(root, mount(root));
    });
  }

  // Mintlify 的页面导航事件在新页面渲染后触发；重复通知不会重复绑定。
  window.addEventListener("mintlify:navigate", sync);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sync, { once: true });
  } else {
    sync();
  }
})();
