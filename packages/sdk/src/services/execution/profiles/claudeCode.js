export const claudeCodeProfile = {
    label: 'claude-code',
    command: {
        binary: 'npx',
        args: [
            '-y',
            '@anthropic-ai/claude-code@latest',
            '-p',
            '--dangerously-skip-permissions',
            '--verbose',
            '--output-format=stream-json'
        ]
    },
    variants: [
        {
            label: 'plan',
            command: {
                binary: 'npx',
                args: [
                    '-y',
                    '@anthropic-ai/claude-code@latest',
                    '-p',
                    '--permission-mode=plan',
                    '--verbose',
                    '--output-format=stream-json'
                ]
            }
        }
    ]
};
//# sourceMappingURL=claudeCode.js.map