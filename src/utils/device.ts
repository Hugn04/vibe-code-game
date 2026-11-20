/**
 * Thiết bị dùng cảm ứng làm cách nhập chính (điện thoại, máy tính bảng).
 * Laptop có màn cảm ứng vẫn được coi là máy tính vì con trỏ chính là chuột.
 */
export const IS_TOUCH_DEVICE: boolean =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches ||
    (navigator.maxTouchPoints > 0 && !window.matchMedia?.('(hover: hover)').matches));
