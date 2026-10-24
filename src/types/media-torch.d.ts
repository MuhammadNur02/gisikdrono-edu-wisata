// The torch of the Image Capture spec (W3C mediacapture-image), which lib.dom knows only on MediaTrackSettings. The
// scanner reads it from a camera track's capabilities and switches it with applyConstraints (Task P4.4.04).
interface MediaTrackCapabilities {
  torch?: boolean;
}

interface MediaTrackConstraintSet {
  torch?: ConstrainBoolean;
}
