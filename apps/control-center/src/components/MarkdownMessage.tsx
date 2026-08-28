import ReactMarkdown from 'react-markdown';

type Props = {
  content: string;
  streaming?: boolean;
};

export function MarkdownMessage({ content, streaming = false }: Props) {
  return (
    <div className={`markdown-message${streaming ? ' is-streaming' : ''}`}>
      <ReactMarkdown
        skipHtml
        disallowedElements={['img']}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
