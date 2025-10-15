# Contributing to AI Analyze Selection

Thank you for your interest in contributing to the AI Analyze Selection Chrome Extension! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites
- Chrome browser (latest version)
- Basic knowledge of JavaScript, HTML, and CSS
- Understanding of Chrome Extensions (Manifest V3)
- OpenAI API key for testing

### Development Setup
1. Fork the repository
2. Clone your fork locally
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode"
5. Click "Load unpacked" and select the extension folder
6. Make your changes and test them

## How to Contribute

### Reporting Issues
- Use the GitHub Issues tab
- Provide clear description of the problem
- Include steps to reproduce
- Specify Chrome version and OS
- Include screenshots if applicable

### Suggesting Features
- Use the GitHub Issues tab with "enhancement" label
- Describe the feature clearly
- Explain the use case and benefits
- Consider implementation complexity

### Code Contributions
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly
5. Commit with clear messages
6. Push to your fork
7. Create a Pull Request

## Code Style Guidelines

### JavaScript
- Use modern ES6+ syntax
- Follow consistent indentation (2 spaces)
- Use meaningful variable names
- Add comments for complex logic
- Handle errors gracefully

### HTML
- Use semantic HTML elements
- Include proper accessibility attributes
- Keep structure clean and simple

### CSS
- Use consistent naming conventions
- Follow the existing dark theme
- Use CSS custom properties for colors
- Ensure responsive design

## Testing Guidelines

### Manual Testing
- Test on different websites
- Try various content types (text, math, data)
- Test keyboard shortcuts
- Verify API key configuration
- Test error scenarios

### Test Cases
- [ ] Text selection and analysis
- [ ] Mathematical problem solving
- [ ] Chart generation
- [ ] Toggle functionality
- [ ] Copy to clipboard
- [ ] Error handling
- [ ] API key validation

## Project Structure

```
ai-analyze-extension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker for AI calls
├── content.js            # Content script for UI and text selection
├── content.css           # Styling for overlay and charts
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality
├── options.html          # Settings page
├── options.js            # Settings functionality
├── README.md             # Project documentation
├── LICENSE               # MIT License
├── CHANGELOG.md          # Version history
└── CONTRIBUTING.md       # This file
```

## Key Components

### Background Script (`background.js`)
- Handles keyboard commands
- Manages OpenAI API calls
- Processes AI responses
- Manages extension state

### Content Script (`content.js`)
- Captures text selection
- Renders overlay UI
- Handles chart rendering
- Manages user interactions

### Styling (`content.css`)
- Dark theme implementation
- Chart styling
- Animation definitions
- Responsive design

## Areas for Contribution

### Features
- Additional chart types
- More AI model options
- Custom themes
- Export functionality
- Batch processing

### Improvements
- Performance optimization
- Better error handling
- Enhanced accessibility
- Mobile support
- Internationalization

### Documentation
- Code comments
- User guides
- API documentation
- Video tutorials

## Pull Request Process

1. **Fork and Branch**: Create a feature branch from main
2. **Develop**: Make your changes with proper testing
3. **Document**: Update documentation if needed
4. **Test**: Ensure all functionality works
5. **Submit**: Create a clear PR description

### PR Requirements
- Clear description of changes
- Reference related issues
- Include screenshots for UI changes
- Ensure code follows style guidelines
- Test on multiple scenarios

## Code Review Process

- All PRs require review
- Reviewers will check code quality
- Testing will be verified
- Documentation updates reviewed
- Security implications considered

## Release Process

1. Update version in `manifest.json`
2. Update `CHANGELOG.md`
3. Create release tag
4. Test final build
5. Publish to Chrome Web Store

## Community Guidelines

### Be Respectful
- Use welcoming and inclusive language
- Be respectful of differing viewpoints
- Accept constructive criticism gracefully

### Be Collaborative
- Help others when possible
- Share knowledge and resources
- Work together toward common goals

### Be Professional
- Keep discussions focused on the project
- Avoid personal attacks or harassment
- Maintain a professional tone

## Getting Help

- Check existing issues and discussions
- Ask questions in GitHub Discussions
- Review documentation and code comments
- Contact maintainers for complex issues

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes
- GitHub contributors page

Thank you for contributing to AI Analyze Selection!
