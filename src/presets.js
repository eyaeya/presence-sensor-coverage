/* ===== Sensor Presets =====
 * 编辑此文件以增删改预设传感器。
 * variant 中未列出的字段（如 height、tilt）将沿用该 mount 的 MOUNT_DEFAULTS。
 */
window.SensorPresets = [
  {
    id: "ziqing-trio",
    name: "子擎 Trio",
    variants: [
      { mount: "side",    label: "侧装",
        hFov: 160, vFov: 90,  rangePresence: 6000, rangeMotion: 7000,
        height: 1500, tilt: 0 }
    ]
  },
  {
    id: "ziqing-celling",
    name: "子擎 Celling",
    variants: [
      { mount: "ceiling", label: "吸顶",
        hFov: 160, vFov: 160, rangePresence: 4000, rangeMotion: 5500 }
    ]
  },
  {
    id: "xiaomi-pro",
    name: "小米人在 Pro",
    variants: [
      { mount: "ceiling", label: "吸顶",
        hFov: 110, vFov: 60,  rangePresence: 4000, rangeMotion: 7000 },
      { mount: "side",    label: "侧装",
        hFov: 110, vFov: 60,  rangePresence: 4000, rangeMotion: 7000,
        height: 1800, tilt: 30 },
      { mount: "corner",  label: "墙角",
        hFov: 110, vFov: 60,  rangePresence: 4000, rangeMotion: 7000,
        height: 1500, tilt: 0 }
    ]
  }
];
