import { ChatInterface } from '@/components/ChatInterface';

const Index = () => {
  console.log('Index component rendering...');
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <ChatInterface className="h-screen" />
    </div>
  );
};

export default Index;
