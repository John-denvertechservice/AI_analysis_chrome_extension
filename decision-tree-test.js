// Decision Tree Test Verification Script
// Run this in the browser console to test the decision tree logic

function testDecisionTree() {
    console.log("🧪 Testing Decision Tree Implementation");
    console.log("=====================================");
    
    // Test cases
    const testCases = [
        {
            name: "Long Text (>75 words)",
            text: "Artificial intelligence has revolutionized many industries and continues to transform the way we work, live, and interact with technology. From machine learning algorithms that power recommendation systems to natural language processing models that enable chatbots and virtual assistants, AI is becoming increasingly sophisticated and capable. The development of large language models has opened up new possibilities for human-computer interaction, allowing for more natural and intuitive communication. As AI technology continues to advance, we can expect to see even more innovative applications and use cases emerge across various sectors including healthcare, finance, education, and entertainment. The future of AI holds great promise for solving complex problems and improving efficiency in ways we are only beginning to understand.",
            expectedFinalAnswer: false,
            expectedBehavior: "Summarize + ask how to proceed"
        },
        {
            name: "Fill-in-the-blank",
            text: "Cats belong to the species _____",
            expectedFinalAnswer: true,
            expectedBehavior: "Return most likely answer"
        },
        {
            name: "Question",
            text: "What is the capital of France?",
            expectedFinalAnswer: true,
            expectedBehavior: "Answer directly"
        },
        {
            name: "Matter-of-fact Statement",
            text: "The sky is blue and water is wet.",
            expectedFinalAnswer: false,
            expectedBehavior: "Brief summary + ask how to proceed"
        },
        {
            name: "Command",
            text: "Calculate the area of a circle with radius 5",
            expectedFinalAnswer: true,
            expectedBehavior: "Execute and return result"
        },
        {
            name: "Code",
            text: "function fibonacci(n) {\n    if (n <= 1) return n;\n    return fibonacci(n - 1) + fibonacci(n - 2);\n}",
            expectedFinalAnswer: false,
            expectedBehavior: "Identify language + summarize"
        }
    ];
    
    // Helper functions (simplified versions from background.js)
    function getWordCount(text) {
        return text.trim().split(/\s+/).filter(Boolean).length;
    }
    
    function isFillInBlank(text) {
        const t = text.trim();
        if (/{?_{2,}}?/.test(t) || /\b_{2,}\b/.test(t)) return true;
        if (/:\s*\?$/.test(t) || /\bfill\s*in\s*the\s*blank\b/i.test(t)) return true;
        if (/[_–—-]{3,}\s*\?$/.test(t)) return true;
        return false;
    }
    
    function isLikelyQuestion(text) {
        const trimmed = text.trim();
        const lower = trimmed.toLowerCase();
        const interrogatives = ["how", "what", "why", "when", "where", "which", "who", "whom", "whose", "can", "could", "would", "should", "is", "are", "am", "will", "may", "might", "do", "does", "did"];
        return /\?\s*$/.test(trimmed) || (interrogatives.some((word) => lower.startsWith(`${word} `)) && trimmed.length <= 200);
    }
    
    function isLikelyCommand(text) {
        const trimmed = text.trim().toLowerCase();
        const imperativeVerbs = [
            "answer", "calculate", "compute", "summarize", "solve", "find", "list",
            "graph", "plot", "chart", "translate", "explain", "draft", "write",
            "build", "create", "plan", "outline", "analyze", "estimate", "evaluate",
            "select", "choose", "determine"
        ];
        return imperativeVerbs.some((verb) => trimmed.startsWith(verb) || trimmed.startsWith(`please ${verb}`));
    }
    
    function isLikelyCode(text) {
        const codeIndicators = [
            /```[\s\S]*```/, // fenced code block
            /#include\s+<[^>]+>/,
            /\b(function|const|let|var|console\.log|=>|class|import|export|async|await)\b/,
            /\b(def|lambda|print\(|self|None)\b/,
            /\bpublic\s+class\b/,
            /\bSystem\.out\.println\b/,
            /\bBEGIN\b.*\bEND\b/si,
            /<\/?[a-z][^>]*>/ // HTML/XML
        ];
        return codeIndicators.some((pattern) => pattern.test(text));
    }
    
    // Test each case
    testCases.forEach((testCase, index) => {
        console.log(`\n${index + 1}. ${testCase.name}`);
        console.log(`Text: "${testCase.text.substring(0, 50)}${testCase.text.length > 50 ? '...' : ''}"`);
        
        const words = getWordCount(testCase.text);
        const isFillBlank = isFillInBlank(testCase.text);
        const isQuestion = isLikelyQuestion(testCase.text);
        const isCommand = isLikelyCommand(testCase.text);
        const isCode = isLikelyCode(testCase.text);
        
        console.log(`Word count: ${words}`);
        console.log(`Fill-in-blank: ${isFillBlank}`);
        console.log(`Question: ${isQuestion}`);
        console.log(`Command: ${isCommand}`);
        console.log(`Code: ${isCode}`);
        
        // Determine expected behavior based on decision tree
        let actualBehavior = "";
        let actualFinalAnswer = false;
        
        if (words > 75) {
            actualBehavior = "Summarize + ask how to proceed";
            actualFinalAnswer = false;
        } else if (isFillBlank) {
            actualBehavior = "Return most likely answer";
            actualFinalAnswer = true;
        } else if (isQuestion) {
            actualBehavior = "Answer directly";
            actualFinalAnswer = true;
        } else if (isCommand) {
            actualBehavior = "Execute and return result";
            actualFinalAnswer = true;
        } else if (isCode) {
            actualBehavior = "Identify language + summarize";
            actualFinalAnswer = false;
        } else {
            actualBehavior = "Brief summary + ask how to proceed";
            actualFinalAnswer = false;
        }
        
        console.log(`Expected behavior: ${testCase.expectedBehavior}`);
        console.log(`Actual behavior: ${actualBehavior}`);
        console.log(`Expected Final Answer: ${testCase.expectedFinalAnswer}`);
        console.log(`Actual Final Answer: ${actualFinalAnswer}`);
        
        const behaviorMatch = actualBehavior === testCase.expectedBehavior;
        const finalAnswerMatch = actualFinalAnswer === testCase.expectedFinalAnswer;
        
        if (behaviorMatch && finalAnswerMatch) {
            console.log("✅ PASS");
        } else {
            console.log("❌ FAIL");
            if (!behaviorMatch) console.log(`   Behavior mismatch: expected "${testCase.expectedBehavior}", got "${actualBehavior}"`);
            if (!finalAnswerMatch) console.log(`   Final Answer mismatch: expected ${testCase.expectedFinalAnswer}, got ${actualFinalAnswer}`);
        }
    });
    
    console.log("\n🎯 Decision Tree Test Complete!");
    console.log("Now test the actual extension with these same examples to verify AI responses match the logic.");
}

// Run the test
testDecisionTree();
