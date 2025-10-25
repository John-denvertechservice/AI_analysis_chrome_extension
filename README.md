# AI Analyze Selection - Chrome Extension

A powerful Chrome extension that provides AI-powered analysis of selected text and images with mathematical problem solving and interactive conversation capabilities.

## Features

- **AI Text Analysis**: Get intelligent analysis of any selected text using OpenAI GPT models or Claude AI models
- **AI Image Analysis**: Analyze images, charts, diagrams, and screenshots with detailed visual insights
- **Interactive Conversations**: Ask follow-up questions, request clarifications, or modify the analysis
- **Mathematical Problem Solving**: Step-by-step solutions with bold final answers and italic verification
- **Smart Toggle**: Use the same hotkey to open/close the analysis panel
- **Dark Theme**: Sleek black interface with white text for optimal readability
- **Smooth Animations**: Professional fade-in/fade-out transitions
- **Timestamp Display**: Shows when analysis was performed
- **Copy Functionality**: Easy copying of AI responses
- **Word Limit Validation**: 50-word limit for follow-up questions to keep interactions focused

## Installation

### From Chrome Web Store
*Coming soon - extension will be published to the Chrome Web Store*

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension will appear in your extensions list

## Usage

1. **Select any text or image** on a webpage
2. **Press Alt+Shift+A** (or Cmd+Shift+A on Mac) to analyze
3. **View the AI analysis** in the bottom-right corner
4. **Ask follow-up questions** using the input field (max 50 words)
5. **Continue the conversation** with contextual responses
6. **Press Alt+Shift+A again** to close the panel
7. **Copy results** using the Copy button

## Configuration

### API Key Setup
1. Click the extension icon in your browser toolbar
2. Click "Open Options"
3. Choose your AI provider (OpenAI or Claude)
4. Enter your API key for the selected provider
5. Select your preferred model
6. Save your settings

### Keyboard Shortcut
- **Default**: Alt+Shift+A (Windows/Linux) or Cmd+Shift+A (Mac)
- **Customizable**: Go to `chrome://extensions/shortcuts` to change

## Supported Content Types

### Text Analysis
- General text analysis and insights
- Content summarization
- Key point extraction
- Trend analysis
- Interactive follow-up conversations
- Clarification requests
- Modification requests

### Image Analysis
- Photo descriptions and scene analysis
- Chart and graph interpretation
- Screenshot and UI analysis
- Text extraction from images
- Object and person identification
- Color and composition analysis
- Interactive image conversations

### Mathematical Problems
- Algebraic equations
- Calculus problems
- Geometry problems
- Statistics and probability
- Step-by-step solutions with verification

## Decision Tree Behavior

The extension follows a structured decision tree to ensure consistent AI responses across all models:

### Text Analysis Rules
- **Over 75 words**: Summarize key points, then ask how the user would like to proceed with helpful suggestions (no Final Answer)
- **Fill-in-the-blank**: Return most likely answer (with Final Answer)
- **Questions**: Provide a brief answer and include a Final Answer field
- **Math problems**: Restate clearly, solve step-by-step, and include a Final Answer field
- **Matter-of-fact statements**: Give a ≤15-word summary and ask how the user wants to proceed (no Final Answer)
- **Commands (answer/calculate/evaluate/graph/select...)**: Execute and return result (with Final Answer; graphs as ASCII)
- **Code**: Identify language, summarize functionality, offer clarification (no Final Answer)

### Image Analysis Rules
- **Images with text**: Apply the text analysis rules to the extracted text
- **Images without text**: Provide descriptive analysis without a Final Answer field

This ensures predictable and consistent behavior regardless of which AI provider or model is selected.


## Technical Details

### Architecture
- **Manifest V3**: Modern Chrome extension architecture
- **Content Scripts**: Injected into web pages for text selection
- **Background Service Worker**: Handles AI API calls and commands

### AI Integration
- **Providers**: OpenAI API and Claude API (Anthropic)
- **OpenAI Models**: GPT-5 Mini, GPT-5 Nano (configurable)
- **Claude Models**: Claude 3.5 Sonnet (default), Claude 3.5 Haiku, Claude 3 Opus (configurable)
- **Temperature**: Optimized for accuracy (0.0 for math, 0.2 for general)
- **Context**: Intelligent prompt engineering for different content types
- **Vision**: High-detail image analysis with both OpenAI and Claude models
- **Token Limits**: Up to 2000 tokens for comprehensive responses
- **Beta Features**: Latest Claude API capabilities with enhanced tool usage

### Security
- **No external dependencies**: Self-contained extension
- **Secure API calls**: Direct communication with OpenAI and Claude APIs
- **Local storage**: API keys stored securely in Chrome sync
- **CSP compliant**: No external script loading

## Development

### Project Structure
```
ai-analyze-extension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker for AI calls
├── content.js            # Content script for UI and text selection
├── content.css           # Styling for overlay interface
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality
├── options.html          # Settings page
├── options.js            # Settings functionality
└── README.md             # This file
```

### Building
No build process required - the extension runs directly from source files.

### Testing
1. Load the extension in developer mode
2. Test on various websites with different content types
3. Verify API key configuration works
4. Test keyboard shortcuts and UI interactions

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Privacy Policy

This extension:
- **Does not collect personal data**
- **Only sends selected text to OpenAI API**
- **Stores API key locally in Chrome sync**
- **Does not track user behavior**
- **Does not share data with third parties**

## Support

- **Issues**: Report bugs or request features via GitHub Issues
- **Documentation**: Check this README for usage instructions
- **API Keys**: 
  - Get your OpenAI API key from [OpenAI Platform](https://platform.openai.com/)
  - Get your Claude API key from [Anthropic Console](https://console.anthropic.com/)

## Changelog

### Version 0.7.0 (Unreleased)
- **Claude Model Selection**: Restricted to Claude 3.5 Sonnet, Claude 3.5 Haiku, and Claude 3 Opus only
- Removed deprecated Claude 3 Sonnet and Claude 3 Haiku from model selection
- Automatic migration for users with older Claude 3 models to Claude 3.5 Sonnet
- Updated documentation to reflect current model availability

### Version 0.6.0
- Enhanced Claude 3.5 Sonnet integration with latest API features
- Support for all current Claude models (3.5 Sonnet, 3.5 Haiku, 3 Opus)
- Claude 3.5 Sonnet as the default Claude model
- Beta API features support for enhanced capabilities
- Increased token limits (2000 max tokens) for more comprehensive responses
- Improved error handling and fallback mechanisms
- **Decision Tree Integration**: Standardized AI behavior across all models
- **Consistent Response Patterns**: Predictable Final Answer inclusion based on content type

### Version 0.5.0
- Added Claude AI integration alongside OpenAI
- Support for Claude 3.5 Sonnet, Claude 3.5 Haiku, and Claude 3 Sonnet/Haiku models
- Provider selection in options (OpenAI or Claude)
- Enhanced model selection with provider-specific options
- Updated UI to support both AI providers

### Version 0.4.0
- Added AI image analysis capabilities
- Support for analyzing PNG, JPG, and other image formats
- Image preview in analysis results
- Interactive conversations about images
- Vision API integration with GPT-4o

### Version 0.3.1
- Removed Plotly charting and visualization functionality
- Simplified extension to focus on text analysis and conversations
- Eliminated external library dependencies

### Version 0.3.0
- Interactive conversation feature for follow-up questions
- 50-word limit validation for user input
- Conversation history display
- Enhanced UI with conversation interface

### Version 0.2.0
- ChatGPT 5 Mini integration as default model
- Enhanced AI analysis capabilities
- Backward compatibility with existing models

### Version 0.1.0
- Initial release
- AI text analysis with GPT-4
- Mathematical problem solving
- Dark theme interface
- Toggle functionality
- Copy to clipboard
- Timestamp display

## Acknowledgments

- Built with OpenAI's ChatGPT 5 Mini and GPT-4 APIs
- Uses Chrome Extension Manifest V3
- Inter font for optimal readability
