interface Props {
  message?: string
}

export default function LoadingSpinner({ message = 'Loading…' }: Props) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
      <span>{message}</span>
    </div>
  )
}
