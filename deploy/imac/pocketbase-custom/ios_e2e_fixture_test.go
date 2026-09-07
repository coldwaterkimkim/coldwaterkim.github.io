package main

// This fixture is compiled only into the Go test binary. It never opens production data.
import (
 "encoding/json"
 "net"
 "net/http"
 "os"
 "os/signal"
 "path/filepath"
 "syscall"
 "testing"
 "time"

 "github.com/pocketbase/pocketbase/apis"
 "github.com/pocketbase/pocketbase/core"
 "github.com/pocketbase/pocketbase/tests"
)

func TestIOSFixtureServer(t *testing.T) {
 ready := os.Getenv("CWK_IOS_FIXTURE_READY")
 if ready == "" { t.Skip("explicit simulator fixture opt-in required") }
 app, err := tests.NewTestApp()
 if err != nil { t.Fatal(err) }; defer app.Cleanup()
 media := core.NewBaseCollection("media")
 public := ""; media.ViewRule = &public
 media.Fields.Add(&core.FileField{Name:"file", MaxSelect:1, MaxSize:mobileFileLimit})
 if err = app.Save(media); err != nil { t.Fatal(err) }
 for _, name := range []string{"posts", "daily_entries"} {
  c:=core.NewBaseCollection(name)
  c.Fields.Add(&core.TextField{Name:"title"}, &core.TextField{Name:"slug"}, &core.TextField{Name:"day_key"}, &core.TextField{Name:"content",Max:4000000}, &core.TextField{Name:"status"}, &core.DateField{Name:"first_published_at"}, &core.DateField{Name:"published_at"})
  if err = app.Save(c); err != nil { t.Fatal(err) }
 }
 if err = ensureRecordsV2(app); err != nil { t.Fatal(err) }
 if err = ensureMobile(app, "aaaaaaaaaaaaaaa"); err != nil { t.Fatal(err) }
 users,err:=app.FindCollectionByNameOrId("users"); if err!=nil {t.Fatal(err)}
 owner:=core.NewRecord(users); owner.Id="aaaaaaaaaaaaaaa"
 owner.SetEmail("owner@example.test"); owner.SetPassword("ColdwaterCI-Photo-9!"); owner.SetVerified(true)
 if err=app.Save(owner);err!=nil {t.Fatal(err)}
 router,err:=apis.NewRouter(app);if err!=nil {t.Fatal(err)}
 event:=&core.ServeEvent{App:app,Router:router}
 (&mobileService{app:app,ownerUserID:owner.Id}).registerRoutes(event)
 (&recordsV2Service{app:app,ownerUserID:owner.Id}).registerRoutes(event)
 mux,err:=router.BuildMux();if err!=nil {t.Fatal(err)}
 listener,err:=net.Listen("tcp","127.0.0.1:18119");if err!=nil {t.Fatal(err)}
 server:=&http.Server{Handler:mux,ReadHeaderTimeout:10*time.Second}
 defer server.Close()
 go server.Serve(listener)
 if err=os.MkdirAll(filepath.Dir(ready),0700);err!=nil {t.Fatal(err)}
 data,_:=json.Marshal(map[string]string{"url":"http://127.0.0.1:18119","dataDir":app.DataDir()})
 if err=os.WriteFile(ready,data,0600);err!=nil {t.Fatal(err)}
 defer os.Remove(ready)
 t.Log("Isolated iOS fixture ready on loopback")
 stop:=make(chan os.Signal,1);signal.Notify(stop,os.Interrupt,syscall.SIGTERM);defer signal.Stop(stop)
 select {case <-stop: case <-time.After(25*time.Minute):}
}
