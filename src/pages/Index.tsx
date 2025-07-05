// Update this page (the content is just a fallback if you fail to update the page)

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900">
      <div className="text-center space-y-8 p-8">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-xl">V</span>
          </div>
          <h1 className="text-6xl font-bold text-white">
            Veritas
          </h1>
        </div>
        <p className="text-xl text-gray-300 max-w-2xl mx-auto">
          Truth Verification System - A blockchain-powered fact-checking platform that verifies statements using AI and cryptographic verification.
        </p>
        <div className="flex gap-4 justify-center">
          <button 
            onClick={() => window.location.href = '/chatbot'}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
          >
            Start Fact-Checking
          </button>
          <button 
            onClick={() => window.location.href = '/admin'}
            className="border border-gray-600 hover:border-gray-500 text-gray-300 px-8 py-3 rounded-lg font-semibold transition-colors"
          >
            Admin Portal
          </button>
        </div>
      </div>
    </div>
  );
};

export default Index;
