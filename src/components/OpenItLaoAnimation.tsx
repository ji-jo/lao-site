type OpenItLaoAnimationProps = {
  className?: string;
  src?: string;
};

export default function OpenItLaoAnimation({
  className = '',
  src = '/media/open-it-lao-animation.svg',
}: OpenItLaoAnimationProps) {
  return (
    <object
      aria-hidden="true"
      className={className}
      data={src}
      tabIndex={-1}
      type="image/svg+xml"
    />
  );
}
