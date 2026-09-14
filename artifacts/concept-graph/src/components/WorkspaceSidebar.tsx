import React from 'react';
import { UploadCloud, FileText, Trash2, Loader2, Play } from 'lucide-react';
import { LectureSource } from '@workspace/api-client-react';
import { extractTextFromPDF } from '@/lib/pdf';
import { cn } from '@/lib/utils';
import { useAnalyzeConceptGraph } from '@workspace/api-client-react';
import { toast } from '@/hooks/use-toast';

interface WorkspaceSidebarProps {
  sources: LectureSource[];
  setSources: React.Dispatch<React.SetStateAction<LectureSource[]>>;
  onGraphGenerated: (graph: any) => void;
}

export function WorkspaceSidebar({ sources, setSources, onGraphGenerated }: WorkspaceSidebarProps) {
  const [isUploading, setIsUploading] = React.useState(false);
  const [prompt, setPrompt] = React.useState('');
  
  const analyzeMutation = useAnalyzeConceptGraph();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    try {
      const newSources: LectureSource[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type !== 'application/pdf') {
          continue;
        }
        
        const { text, pages, pageCount } = await extractTextFromPDF(file);
        newSources.push({
          id: Math.random().toString(36).substring(7),
          name: file.name,
          text,
          pageCount,
          pages
        });
      }
      
      setSources(prev => [...prev, ...newSources]);
    } catch (err) {
      console.error(err);
      toast({
        title: "Upload failed",
        description: "Failed to extract text from PDF. Check console for details.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
      // Reset input
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveSource = (id: string) => {
    setSources(prev => prev.filter(s => s.id !== id));
  };

  const handleGenerate = () => {
    if (sources.length === 0 && !prompt.trim()) return;

    const promptTitle = prompt.trim().split(/\s+/).slice(0, 7).join(' ');
    
    analyzeMutation.mutate({
      data: {
        title: sources.length > 0
          ? sources[0].name.replace(/\.pdf$/i, '') + (sources.length > 1 ? ' & others' : '')
          : promptTitle || 'Concept Study',
        prompt: prompt.trim() || 'Create a comprehensive concept dependency graph.',
        sources
      }
    }, {
      onSuccess: (data) => {
        onGraphGenerated(data);
      },
      onError: () => {
        toast({
          title: "Analysis failed",
          description: "Could not generate concept graph.",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <div className="w-80 bg-card border-r border-border flex flex-col h-full z-10 shadow-lg">
      <div className="p-6 border-b border-border bg-gradient-to-b from-card to-background">
        <h1 className="font-serif text-2xl font-bold text-foreground">Concept Node</h1>
        <p className="text-sm text-muted-foreground mt-1">Study workspace</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-foreground">
            <FileText className="w-4 h-4 text-primary" /> Sources
          </h3>
          
          <div className="space-y-2 mb-4">
            {sources.map(source => (
              <div key={source.id} className="flex items-center justify-between p-2 rounded-md bg-background border border-border text-sm group transition-all hover:border-primary/50">
                <div className="flex items-center gap-2 truncate">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate" title={source.name}>{source.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{source.pageCount}p</span>
                  <button 
                    onClick={() => handleRemoveSource(source.id)}
                    className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            
            {sources.length === 0 && (
              <div className="text-center p-4 border border-dashed border-border rounded-lg text-muted-foreground text-sm bg-background/50">
                No sources added yet.
              </div>
            )}
          </div>

          <label className={cn(
            "flex items-center justify-center gap-2 w-full p-3 rounded-lg border border-dashed cursor-pointer transition-all text-sm font-medium",
            isUploading ? "opacity-50 border-border cursor-not-allowed" : "border-primary/50 hover:border-primary hover:bg-primary/5 text-primary"
          )}>
            <input 
              type="file" 
              accept=".pdf" 
              multiple 
              className="hidden" 
              onChange={handleFileUpload}
              disabled={isUploading}
            />
            {isUploading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Extracting text...</>
            ) : (
              <><UploadCloud className="w-4 h-4" /> Upload PDFs</>
            )}
          </label>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-3 text-foreground">Focus Prompt (Optional)</h3>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="E.g. Focus on machine learning algorithms and their prerequisites..."
            className="w-full bg-background border border-border rounded-lg p-3 text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
          />
        </div>
      </div>

      <div className="p-6 border-t border-border bg-background/50 backdrop-blur-sm">
        <button
          onClick={handleGenerate}
          disabled={(sources.length === 0 && !prompt.trim()) || analyzeMutation.isPending}
          className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:brightness-110 transition-all shadow-md active:scale-[0.98]"
        >
          {analyzeMutation.isPending ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Generating Graph...</>
          ) : (
            <><Play className="w-5 h-5 fill-current" /> Generate Graph</>
          )}
        </button>
      </div>
    </div>
  );
}
